import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { InvoicesService } from '../invoices/invoices.service';
import { PricingService, PriceQuote } from '../matching/pricing.service';
import { RoutingService } from '../bookings/routing.service';
import { DocumentStorage, detectFileType } from '../drivers/document-storage';
import { MAX_DOCUMENT_BYTES } from '../drivers/drivers.constants';
import { TRACKING_LEAD_MIN, TripStatus } from '../matching/matching.constants';
import { CreateParcelDto, ParcelQuoteDto } from './dto/parcel.dto';
import {
  DEDICATED_PARCEL_SHUTTLE,
  GRAFT_MAX_DETOUR_KM,
  GRAFT_WINDOW_HOURS,
  MAX_DELIVERY_CODE_ATTEMPTS,
  MAX_PARCELS_PER_TRIP,
  MAX_PARCEL_WEIGHT_PER_TRIP_KG,
  MAX_RETURN_PARCELS,
  MAX_RETURN_PARCEL_WEIGHT_KG,
  RETURN_PICKUP_DEADLINE_HOURS,
  returnDepartureOf,
  OPEN_PARCEL_STATUSES,
  PARCEL_MAX_WEIGHT_KG,
  ParcelStatus,
  fitsDimensions,
  haversineKm,
} from './parcels.constants';

export interface RequestUser {
  sub: string;
  role: string;
}

export interface AuditCtx {
  ipAddress?: string;
  userAgent?: string;
}

export interface UploadedImage {
  buffer: Buffer;
  size: number;
}

const MIN_LEAD_TIME_MS = 2 * 3600_000;
const QUOTES_PER_MINUTE = 30;
const PARCELS_PER_HOUR = 10;
const HOUR = 3600_000;

/** Statuts d'une course passager pouvant encore recevoir un colis (pas encore partie). */
const CARRIER_OPEN_STATUSES: string[] = [TripStatus.PENDING, TripStatus.SEARCHING, TripStatus.NO_DRIVER, TripStatus.ACCEPTED];
/** Statuts où le chauffeur porteur traite les colis. */
const CARRIER_ACTIVE_STATUSES: string[] = [TripStatus.ACCEPTED, TripStatus.STARTED];

interface Carrier {
  id: string;
  shuttleType: string;
  /** Départ de la course porteuse, ou de son trajet retour. */
  scheduledAt: Date | null;
  durationMin: number | null;
  onReturnLeg: boolean;
  driverId: string | null;
}

/** Résumé d'un colis dans la mission du chauffeur ("checklist colis", écran 15). */
export interface ParcelChecklistItem {
  id: string;
  status: string;
  description: string;
  weightKg: number | null;
  dimensionsCm: [number | null, number | null, number | null];
  isFragile: boolean;
  /** À récupérer à l'arrivée et à ramener sur le trajet retour. */
  onReturnLeg: boolean;
  pickup: { address: string; lat: number; lng: number };
  delivery: { address: string; lat: number; lng: number };
  sender: { firstName: string | null; phone: string | null };
  recipient: { name: string | null; phone: string | null };
}

/**
 * Module Colis (Partie 6 "Bookings colis", Partie 7 écrans 11-12, et
 * checklist colis de l'écran 15). Le colis voyage :
 * - greffé sur une course passager du même trajet (forfait 8 € HT) quand
 *   il en existe une compatible — "retour de colis intégré" (Partie 1.2) ;
 * - sinon dans une navette dédiée, au tarif kilométrique.
 * Remise prouvée par un code à 4 chiffres (connu du seul expéditeur, qui le
 * transmet au destinataire) et une photo.
 */
@Injectable()
export class ParcelsService {
  private readonly logger = new Logger(ParcelsService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private pricing: PricingService,
    private routing: RoutingService,
    private payments: PaymentsService,
    private notifications: NotificationsService,
    private audit: AuditService,
    private storage: DocumentStorage,
    private invoices: InvoicesService,
  ) {}

  // ── POST /bookings/parcel/quote ─────────────────────────────────────

  /** Les deux options, chacune pouvant être indisponible (avec la raison). */
  async quote(userId: string, dto: ParcelQuoteDto) {
    await this.rateLimit(`parcel:quote:${userId}`, 60, QUOTES_PER_MINUTE, 'Trop de demandes de devis — patientez une minute');
    const jurisdiction = await this.jurisdictionOf(userId);
    this.validateParcel(dto);

    const carrier = await this.findCarrier(dto);
    const grafted = carrier
      ? { available: true, departureAt: carrier.scheduledAt, onReturnLeg: carrier.onReturnLeg, quote: await this.pricing.graftedParcel(jurisdiction) }
      : { available: false, reason: 'Aucune navette prévue sur ce trajet dans les 12 h suivant l’heure choisie' };

    let dedicated: Record<string, unknown>;
    try {
      const d = await this.dedicatedQuote(dto, jurisdiction);
      dedicated = { available: true, departureAt: new Date(dto.scheduledAt), ...d };
    } catch (err) {
      if (!(err instanceof BadRequestException)) throw err;
      dedicated = { available: false, reason: err.message };
    }
    return { grafted, dedicated };
  }

  // ── POST /bookings/parcel ───────────────────────────────────────────

  async create(userId: string, dto: CreateParcelDto, ctx: AuditCtx) {
    await this.rateLimit(`parcel:rate:${userId}`, 3600, PARCELS_PER_HOUR, 'Trop de réservations — réessayez plus tard');
    const jurisdiction = await this.jurisdictionOf(userId);
    this.validateParcel(dto);
    if (dto.pickupAddress === dto.deliveryAddress) throw new BadRequestException('Enlèvement et livraison identiques');

    let carrier: Carrier | null = null;
    let quote: PriceQuote;
    let route: { distanceKm: number | null; durationMin: number | null } = { distanceKm: null, durationMin: null };
    if (dto.mode === 'grafted') {
      // Revérifié au moment de réserver : la place a pu être prise.
      carrier = await this.findCarrier(dto);
      if (!carrier) throw new ConflictException('Plus de navette passager disponible sur ce trajet : choisissez la navette dédiée');
      quote = await this.pricing.graftedParcel(jurisdiction);
    } else {
      const d = await this.dedicatedQuote(dto, jurisdiction);
      quote = d.quote;
      route = { distanceKm: d.distanceKm, durationMin: d.durationMin };
    }

    const parcel = await this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.create({
        data: {
          type: 'parcel',
          status: TripStatus.AWAITING_PAYMENT,
          passengerId: userId, // expéditeur (paiement, historique, annulation)
          shuttleType: carrier?.shuttleType ?? DEDICATED_PARCEL_SHUTTLE,
          originAddress: dto.pickupAddress,
          originLat: dto.pickup.lat,
          originLng: dto.pickup.lng,
          destinationAddress: dto.deliveryAddress,
          destinationLat: dto.delivery.lat,
          destinationLng: dto.delivery.lng,
          distanceKm: route.distanceKm,
          durationMin: carrier ? carrier.durationMin : route.durationMin,
          scheduledAt: carrier?.scheduledAt ?? new Date(dto.scheduledAt),
          totalPriceCents: quote.totalCents,
          vatCents: quote.vatCents,
          jurisdiction,
          priceLines: {
            create: quote.vatLines.map((l) => ({ regime: l.regime, baseCents: l.baseCents, ratePercent: l.ratePercent, vatCents: l.vatCents })),
          },
        },
        select: { id: true, scheduledAt: true },
      });
      return tx.parcelBooking.create({
        data: {
          tripId: trip.id,
          senderId: userId,
          carrierTripId: carrier?.id ?? null,
          onReturnLeg: carrier?.onReturnLeg ?? false,
          description: dto.description,
          recipientName: dto.recipientName,
          recipientPhone: dto.recipientPhone,
          weightKg: dto.weightKg,
          lengthCm: dto.lengthCm,
          widthCm: dto.widthCm,
          heightCm: dto.heightCm,
          isFragile: dto.isFragile ?? false,
          qrCode: randomUUID(),
          deliveryCode: String(randomInt(0, 10_000)).padStart(4, '0'),
        },
        select: { id: true, tripId: true },
      });
    });

    const payment = await this.payments.paymentSheet(userId, parcel.tripId);
    // Colis au retour : le chauffeur sait qu'il ne rentrera pas à vide.
    if (carrier?.onReturnLeg && carrier.driverId) {
      await this.notifications.notify(
        carrier.driverId, 'parcel.return_added', 'Colis pour votre retour',
        'Un colis vous attend à l’arrivée pour votre trajet retour.', { parcelId: parcel.id },
      );
    }
    await this.audit.log({ userId, action: 'parcel.create', entity: 'ParcelBooking', entityId: parcel.id, metadata: { mode: dto.mode, onReturnLeg: carrier?.onReturnLeg ?? false }, ...ctx });
    return {
      parcelId: parcel.id,
      tripId: parcel.tripId,
      mode: dto.mode,
      onReturnLeg: carrier?.onReturnLeg ?? false,
      departureAt: carrier?.scheduledAt ?? new Date(dto.scheduledAt),
      quote,
      payment,
    };
  }

  // ── GET /bookings/parcel/:id et /history ────────────────────────────

  async get(user: RequestUser, parcelId: string) {
    const p = await this.prisma.parcelBooking.findUnique({ where: { id: parcelId }, include: { trip: true } });
    // Expéditeur ou admin. Même réponse pour "inexistant" et "pas à vous".
    if (!p || (p.senderId !== user.sub && user.role !== 'admin')) throw new NotFoundException('Colis introuvable');
    const isSender = p.senderId === user.sub;

    const carrierId = p.carrierTripId ?? p.tripId;
    const carrier = await this.prisma.trip.findUnique({
      where: { id: carrierId },
      select: { status: true, driverId: true, vehicleId: true, scheduledAt: true, startedAt: true },
    });
    const driverAssigned =
      !!carrier?.driverId &&
      (CARRIER_ACTIVE_STATUSES.includes(carrier.status) || (p.onReturnLeg && carrier.status === TripStatus.COMPLETED));
    const [driver, vehicle] = driverAssigned
      ? await Promise.all([
          this.prisma.user.findUnique({ where: { id: carrier!.driverId! }, select: { firstName: true } }),
          carrier!.vehicleId
            ? this.prisma.vehicle.findUnique({ where: { id: carrier!.vehicleId }, select: { brand: true, model: true, color: true, plate: true } })
            : null,
        ])
      : [null, null];

    const t = p.trip;
    return {
      id: p.id,
      tripId: p.tripId,
      mode: t.source === 'line' ? 'line' : p.carrierTripId ? 'grafted' : 'dedicated',
      onReturnLeg: p.onReturnLeg,
      status: t.status === TripStatus.AWAITING_PAYMENT ? 'awaiting_payment' : p.status,
      pickup: { address: t.originAddress, lat: t.originLat, lng: t.originLng },
      delivery: { address: t.destinationAddress, lat: t.destinationLat, lng: t.destinationLng },
      // Colis au retour : sa course porte déjà l'heure estimée du trajet retour.
      departureAt: p.onReturnLeg ? t.scheduledAt : carrier?.scheduledAt ?? t.scheduledAt,
      description: p.description,
      weightKg: p.weightKg == null ? null : Number(p.weightKg),
      dimensionsCm: [p.lengthCm, p.widthCm, p.heightCm],
      isFragile: p.isFragile,
      hasPhoto: !!p.photoKey,
      recipient: { name: p.recipientName, phone: p.recipientPhone },
      totalCents: t.totalPriceCents,
      // Écran 12 : timeline pending → picked_up → in_transit → delivered.
      timeline: {
        createdAt: p.createdAt,
        pickedUpAt: p.pickedUpAt,
        // Retour : en route dès l'enlèvement (le chauffeur repart aussitôt).
        inTransitAt: p.onReturnLeg
          ? p.pickedUpAt
          : p.pickedUpAt && carrier?.startedAt
            ? (carrier.startedAt > p.pickedUpAt ? carrier.startedAt : p.pickedUpAt)
            : null,
        deliveredAt: p.deliveredAt,
        cancelledAt: t.cancelledAt,
      },
      failureReason: p.failureReason,
      driver: driverAssigned ? { firstName: driver?.firstName ?? null, vehicle } : null,
      // Au seul expéditeur : le QR (à montrer au chauffeur à l'enlèvement)
      // et le code de remise (à transmettre au destinataire). Jamais au chauffeur.
      qrCode: isSender ? p.qrCode : undefined,
      deliveryCode: isSender ? p.deliveryCode : undefined,
      cancellable: p.status === ParcelStatus.PENDING && t.status !== TripStatus.CANCELLED,
    };
  }

  async history(userId: string) {
    const parcels = await this.prisma.parcelBooking.findMany({
      where: { senderId: userId },
      include: { trip: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return parcels
      .filter((p) => p.trip.status !== TripStatus.AWAITING_PAYMENT)
      .map((p) => ({
        id: p.id,
        status: p.status,
        description: p.description,
        pickupAddress: p.trip.originAddress,
        deliveryAddress: p.trip.destinationAddress,
        departureAt: p.trip.scheduledAt,
        totalCents: p.trip.totalPriceCents,
      }));
  }

  // ── POST /bookings/parcel/:id/photo ─────────────────────────────────

  /** Photo du colis par l'expéditeur (écran 11), avant l'enlèvement. */
  async uploadPhoto(user: RequestUser, parcelId: string, file: UploadedImage | undefined) {
    const p = await this.prisma.parcelBooking.findUnique({ where: { id: parcelId }, select: { senderId: true, status: true, photoKey: true } });
    if (!p || p.senderId !== user.sub) throw new NotFoundException('Colis introuvable');
    if (p.status !== ParcelStatus.PENDING) throw new ConflictException('Le colis a déjà été pris en charge');
    const key = await this.storeImage(file, 'parcel');
    await this.prisma.parcelBooking.update({ where: { id: parcelId }, data: { photoKey: key } });
    if (p.photoKey) await this.storage.delete(p.photoKey);
    return { hasPhoto: true };
  }

  // ── Chauffeur : enlèvement, remise, échec ───────────────────────────

  /** Le chauffeur scanne le QR de l'expéditeur : le colis est à bord. */
  async pickup(user: RequestUser, parcelId: string, qrCode: string, ctx: AuditCtx) {
    const { parcel, carrier } = await this.forCarrierDriver(user, parcelId);
    if (parcel.status !== ParcelStatus.PENDING) throw new ConflictException('Colis déjà pris en charge');
    if (parcel.onReturnLeg && carrier.status === TripStatus.ACCEPTED) {
      throw new ConflictException('Colis du retour : il se récupère à l’arrivée de votre course');
    }
    if (
      !parcel.onReturnLeg &&
      carrier.status === TripStatus.ACCEPTED &&
      carrier.scheduledAt &&
      carrier.scheduledAt.getTime() - Date.now() > TRACKING_LEAD_MIN * 60_000
    ) {
      throw new ConflictException('Trop tôt : l’enlèvement se fait dans l’heure qui précède le départ');
    }
    if (!safeEqual(qrCode, parcel.qrCode)) throw new BadRequestException('QR code invalide pour ce colis');

    // Retour : le chauffeur repart aussitôt avec le colis.
    const status = parcel.onReturnLeg || carrier.status === TripStatus.STARTED ? ParcelStatus.IN_TRANSIT : ParcelStatus.PICKED_UP;
    await this.prisma.parcelBooking.update({ where: { id: parcelId }, data: { status, pickedUpAt: new Date() } });
    // Le chauffeur devient celui de la course colis : elle compte dans ses
    // revenus (commission XLCAB déduite) une fois le colis remis.
    if (parcel.carrierTripId) {
      await this.prisma.trip.update({ where: { id: parcel.tripId }, data: { driverId: user.sub, vehicleId: carrier.vehicleId } });
    }
    await this.notifySender(parcel.senderId, 'parcel.picked_up', 'Colis pris en charge', 'Le chauffeur XLCAB a récupéré votre colis.', parcelId);
    await this.audit.log({ userId: user.sub, action: 'parcel.pickup', entity: 'ParcelBooking', entityId: parcelId, ...ctx });
    return { parcelId, status };
  }

  /** Remise : code du destinataire + photo du colis remis. */
  async deliver(user: RequestUser, parcelId: string, code: string, file: UploadedImage | undefined, ctx: AuditCtx) {
    const { parcel, carrier } = await this.forCarrierDriver(user, parcelId);
    if (![ParcelStatus.PICKED_UP, ParcelStatus.IN_TRANSIT].includes(parcel.status as never)) {
      throw new ConflictException('Ce colis n’est pas à bord');
    }
    if (!parcel.onReturnLeg && carrier.status !== TripStatus.STARTED) {
      throw new ConflictException('Démarrez la course avant de remettre le colis');
    }

    // Un code à 4 chiffres se devine en 10 000 essais : on bloque après 5.
    const attemptsKey = `parcel:code:attempts:${parcelId}`;
    const attempts = await this.redis.incr(attemptsKey);
    if (attempts === 1) await this.redis.expire(attemptsKey, 24 * 3600);
    if (attempts > MAX_DELIVERY_CODE_ATTEMPTS) {
      throw new HttpException('Trop de codes erronés : contactez le support XLCAB', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!safeEqual(code, parcel.deliveryCode)) {
      throw new BadRequestException(`Code de remise incorrect (${MAX_DELIVERY_CODE_ATTEMPTS - attempts} essai(s) restant(s))`);
    }

    // Photo obligatoire : seconde preuve en cas de litige.
    const proofKey = await this.storeImage(file, 'proof');
    const now = new Date();
    await this.prisma.parcelBooking.update({
      where: { id: parcelId },
      data: { status: ParcelStatus.DELIVERED, deliveredAt: now, proofOfDeliveryKey: proofKey },
    });
    // Colis greffé : sa course propre est terminée avec la remise. Colis
    // en navette dédiée : le chauffeur termine la course lui-même.
    if (parcel.carrierTripId) {
      await this.prisma.trip.updateMany({
        where: { id: parcel.tripId, status: TripStatus.ATTACHED },
        data: { status: TripStatus.COMPLETED, completedAt: now },
      });
      // Colis en navette partagée : facturé à la remise (navette dédiée : à la fin de course).
      await this.invoices.issueForTrip(parcel.tripId);
    }
    await this.redis.del(attemptsKey);
    await this.notifySender(parcel.senderId, 'parcel.delivered', 'Colis livré', 'Votre colis a été remis au destinataire.', parcelId);
    await this.audit.log({ userId: user.sub, action: 'parcel.deliver', entity: 'ParcelBooking', entityId: parcelId, ...ctx });
    return { parcelId, status: ParcelStatus.DELIVERED, deliveredAt: now };
  }

  /** Expéditeur absent, destinataire injoignable… : signalé à l'équipe (incident). */
  async fail(user: RequestUser, parcelId: string, reason: string, ctx: AuditCtx) {
    const { parcel } = await this.forCarrierDriver(user, parcelId);
    if (!OPEN_PARCEL_STATUSES.includes(parcel.status)) throw new ConflictException('Ce colis est déjà clôturé');
    if (parcel.onReturnLeg && parcel.status === ParcelStatus.PENDING) {
      // Colis du retour pas encore à bord (le chauffeur ne rentre pas par ce
      // trajet, expéditeur absent…) : annulé et remboursé, sans litige.
      await this.cancelWithRefund(parcel, 'Le colis n’a pas pu être pris en charge pour le trajet retour');
      await this.audit.log({ userId: user.sub, action: 'parcel.return_declined', entity: 'ParcelBooking', entityId: parcelId, metadata: { reason }, ...ctx });
      return { parcelId, status: ParcelStatus.CANCELLED };
    }
    await this.markFailed(parcel, reason, user.sub, 'driver');
    await this.audit.log({ userId: user.sub, action: 'parcel.fail', entity: 'ParcelBooking', entityId: parcelId, metadata: { reason }, ...ctx });
    return { parcelId, status: ParcelStatus.FAILED };
  }

  // ── Points d'accroche pour le module Trips ──────────────────────────

  /** Colis à afficher dans les missions du chauffeur, par course. */
  async checklistFor(tripIds: string[], nearTripIds: Set<string>): Promise<Map<string, ParcelChecklistItem[]>> {
    const result = new Map<string, ParcelChecklistItem[]>();
    if (tripIds.length === 0) return result;
    const parcels = await this.prisma.parcelBooking.findMany({
      where: {
        OR: [{ carrierTripId: { in: tripIds } }, { tripId: { in: tripIds }, carrierTripId: null }],
        status: { not: ParcelStatus.CANCELLED },
      },
      include: { trip: true },
      orderBy: { createdAt: 'asc' },
    });
    const senderIds = [...new Set(parcels.map((p) => p.senderId).filter((id): id is string => !!id))];
    const senders = senderIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: senderIds } }, select: { id: true, firstName: true, phone: true } })
      : [];
    const byId = new Map(senders.map((s) => [s.id, s]));

    for (const p of parcels) {
      const missionId = p.carrierTripId ?? p.tripId;
      // Téléphones seulement à l'approche (T − 60 min), comme pour les passagers.
      const near = nearTripIds.has(missionId);
      const sender = p.senderId ? byId.get(p.senderId) : undefined;
      const item: ParcelChecklistItem = {
        id: p.id,
        status: p.status,
        description: p.description,
        weightKg: p.weightKg == null ? null : Number(p.weightKg),
        dimensionsCm: [p.lengthCm, p.widthCm, p.heightCm],
        isFragile: p.isFragile,
        onReturnLeg: p.onReturnLeg,
        pickup: { address: p.trip.originAddress, lat: p.trip.originLat, lng: p.trip.originLng },
        delivery: { address: p.trip.destinationAddress, lat: p.trip.destinationLat, lng: p.trip.destinationLng },
        sender: { firstName: sender?.firstName ?? null, phone: near ? sender?.phone ?? null : null },
        recipient: { name: p.recipientName, phone: near ? p.recipientPhone : null },
      };
      result.set(missionId, [...(result.get(missionId) ?? []), item]);
    }
    return result;
  }

  /** Course dédiée : le colis doit être scanné avant de démarrer. */
  async assertReadyToStart(tripId: string, type: string) {
    if (type !== 'parcel') return;
    const p = await this.prisma.parcelBooking.findUnique({ where: { tripId }, select: { status: true } });
    if (p?.status === ParcelStatus.PENDING) {
      throw new ConflictException('Scannez le QR du colis avant de démarrer (ou signalez l’absence de l’expéditeur)');
    }
  }

  /**
   * Démarrage d'une course : les colis à bord passent "en transit". Un colis
   * greffé jamais remis au chauffeur est signalé (incident) : on ne bloque
   * pas le départ des passagers pour un colis absent.
   */
  async onTripStarted(tripId: string, driverId: string) {
    const parcels = await this.prisma.parcelBooking.findMany({
      // Les colis du retour ne sont pas concernés : ils montent à l'arrivée.
      where: {
        OR: [{ carrierTripId: tripId, onReturnLeg: false }, { tripId, carrierTripId: null }],
        status: { in: [ParcelStatus.PENDING, ParcelStatus.PICKED_UP] },
      },
      include: { trip: true },
    });
    for (const p of parcels) {
      if (p.status === ParcelStatus.PICKED_UP) {
        await this.prisma.parcelBooking.update({ where: { id: p.id }, data: { status: ParcelStatus.IN_TRANSIT } });
        await this.notifySender(p.senderId, 'parcel.in_transit', 'Colis en route', 'Votre colis est en route vers sa destination.', p.id);
      } else {
        await this.markFailed(p, 'Colis non remis au chauffeur avant le départ', driverId, 'driver');
      }
    }
  }

  /**
   * Départ de ligne qui démarre : un colis jamais remis au chauffeur est signalé
   * à l'équipe (incident, remboursement éventuel décidé par elle) et sa course
   * sort du départ, qui part avec ses passagers.
   */
  async onLineDepartureStarted(tripId: string, driverId: string) {
    const p = await this.prisma.parcelBooking.findUnique({ where: { tripId }, include: { trip: true } });
    if (!p) return;
    if (p.status === ParcelStatus.PENDING) {
      await this.markFailed(p, 'Colis non remis au chauffeur avant le départ', driverId, 'driver');
      await this.prisma.trip.updateMany({
        where: { id: tripId, status: TripStatus.ACCEPTED },
        data: { status: TripStatus.CANCELLED, cancelledAt: new Date(), cancellationReason: 'Colis non remis au chauffeur avant le départ' },
      });
    }
  }

  /** Fin de course : aucun colis ne doit rester à bord. */
  async assertNoParcelOnBoard(tripId: string) {
    const open = await this.prisma.parcelBooking.count({
      // Les colis du retour se traitent APRÈS la fin de la course aller.
      where: { OR: [{ carrierTripId: tripId, onReturnLeg: false }, { tripId, carrierTripId: null }], status: { in: OPEN_PARCEL_STATUSES } },
    });
    if (open > 0) throw new ConflictException('Remettez les colis à bord (ou signalez un problème) avant de terminer la course');
  }

  /** L'expéditeur annule (via POST /trips/:id/cancel) : seulement avant l'enlèvement. */
  async assertCancellable(tripId: string) {
    const p = await this.prisma.parcelBooking.findUnique({ where: { tripId }, select: { status: true } });
    if (p && p.status !== ParcelStatus.PENDING) throw new ConflictException('Colis déjà pris en charge : annulation impossible');
  }

  async markCancelled(tripId: string) {
    await this.prisma.parcelBooking.updateMany({ where: { tripId, status: ParcelStatus.PENDING }, data: { status: ParcelStatus.CANCELLED } });
  }

  /**
   * Course porteuse annulée : ses colis non encore pris en charge sont
   * annulés et remboursés intégralement (l'expéditeur n'y est pour rien).
   */
  async onCarrierCancelled(carrierTripId: string) {
    const parcels = await this.prisma.parcelBooking.findMany({
      where: { carrierTripId, status: ParcelStatus.PENDING },
      select: { id: true, tripId: true, senderId: true },
    });
    for (const p of parcels) await this.cancelWithRefund(p, 'La navette qui devait transporter votre colis a été annulée');
    return parcels.length;
  }

  /**
   * Planificateur : colis greffés dont la course porteuse n'est jamais
   * partie (aucun chauffeur trouvé, départ dépassé de 15 min).
   */
  async releaseStranded(now = new Date()): Promise<number> {
    const parcels = await this.prisma.parcelBooking.findMany({
      where: { carrierTripId: { not: null }, status: ParcelStatus.PENDING },
      select: { id: true, tripId: true, senderId: true, carrierTripId: true, onReturnLeg: true },
      take: 100,
    });
    let released = 0;
    for (const p of parcels) {
      const carrier = await this.prisma.trip.findUnique({
        where: { id: p.carrierTripId! },
        select: { status: true, scheduledAt: true, driverId: true, completedAt: true },
      });
      let reason: string | null = null;
      if (!carrier) {
        reason = 'La navette prévue pour votre colis n’existe plus';
      } else if (p.onReturnLeg) {
        // Retour : plus de chauffeur (désistement) ou colis jamais récupéré
        // dans les 6 h suivant l'arrivée.
        if (!carrier.driverId || ([TripStatus.PENDING, TripStatus.SEARCHING, TripStatus.NO_DRIVER] as string[]).includes(carrier.status)) {
          reason = 'Le chauffeur prévu pour le trajet retour n’est plus disponible';
        } else if (carrier.status === TripStatus.COMPLETED && carrier.completedAt && carrier.completedAt.getTime() < now.getTime() - RETURN_PICKUP_DEADLINE_HOURS * HOUR) {
          reason = 'Le colis n’a pas été récupéré pour le trajet retour';
        }
      } else if (
        ([TripStatus.PENDING, TripStatus.SEARCHING, TripStatus.NO_DRIVER] as string[]).includes(carrier.status) &&
        !!carrier.scheduledAt && carrier.scheduledAt.getTime() < now.getTime() - 15 * 60_000
      ) {
        reason = 'Aucun chauffeur n’a pu assurer la navette prévue pour votre colis';
      }
      if (!reason) continue;
      await this.cancelWithRefund(p, reason);
      released++;
    }
    return released;
  }

  /**
   * Désistement du chauffeur : ses colis du retour n'ont plus de transporteur
   * (le retour est lié au chauffeur, pas à la course). Annulés et remboursés.
   */
  async onDriverWithdrew(tripId: string) {
    const parcels = await this.prisma.parcelBooking.findMany({
      where: { carrierTripId: tripId, onReturnLeg: true, status: ParcelStatus.PENDING },
      select: { id: true, tripId: true, senderId: true },
    });
    for (const p of parcels) await this.cancelWithRefund(p, 'Le chauffeur prévu pour le trajet retour n’est plus disponible');
  }

  // ── Utilitaires ─────────────────────────────────────────────────────

  private async cancelWithRefund(p: { id: string; tripId: string; senderId: string | null }, reason: string) {
    const updated = await this.prisma.trip.updateMany({
      where: { id: p.tripId, status: { in: [TripStatus.AWAITING_PAYMENT, TripStatus.ATTACHED] } },
      data: { status: TripStatus.CANCELLED, cancelledAt: new Date(), cancellationReason: reason, cancellationFeeCents: 0 },
    });
    await this.prisma.parcelBooking.update({ where: { id: p.id }, data: { status: ParcelStatus.CANCELLED } });
    if (updated.count === 0) return;
    const refund = await this.payments.refundForCancellation(p.tripId, 0);
    await this.notifySender(
      p.senderId, 'parcel.cancelled', 'Envoi de colis annulé',
      `${reason}. ${refund.refundedCents > 0 ? 'Vous êtes remboursé intégralement.' : 'Aucun montant n’a été débité.'}`, p.id,
    );
  }

  private async markFailed(
    parcel: { id: string; tripId: string; senderId: string | null; carrierTripId: string | null; trip?: { originLat: number; originLng: number } },
    reason: string,
    reporterId: string,
    role: string,
  ) {
    await this.prisma.parcelBooking.update({ where: { id: parcel.id }, data: { status: ParcelStatus.FAILED, failureReason: reason } });
    // Remboursement éventuel décidé par l'équipe (incident à traiter).
    const coords = parcel.trip ?? (await this.prisma.trip.findUnique({ where: { id: parcel.tripId }, select: { originLat: true, originLng: true } }));
    try {
      await this.prisma.incident.create({
        data: { type: 'parcel_failed', tripId: parcel.tripId, userId: reporterId, role, lat: coords?.originLat ?? 0, lng: coords?.originLng ?? 0, notes: reason },
      });
    } catch (err) {
      this.logger.error(`Incident colis non enregistré (${parcel.id}) : ${(err as Error).message}`);
    }
    await this.notifySender(parcel.senderId, 'parcel.failed', 'Problème avec votre colis', `${reason}. Notre équipe vous recontacte.`, parcel.id);
  }

  /** Colis + course qui le transporte, si l'appelant en est le chauffeur. */
  private async forCarrierDriver(user: RequestUser, parcelId: string) {
    const parcel = await this.prisma.parcelBooking.findUnique({ where: { id: parcelId }, include: { trip: true } });
    if (!parcel) throw new NotFoundException('Colis introuvable');
    const carrier = await this.prisma.trip.findUnique({
      where: { id: parcel.carrierTripId ?? parcel.tripId },
      select: { id: true, driverId: true, vehicleId: true, status: true, scheduledAt: true, completedAt: true },
    });
    if (!carrier || carrier.driverId !== user.sub) throw new NotFoundException('Colis introuvable');
    // Colis du retour : traité après la fin de la course aller, dans un délai raisonnable.
    const returnPhase =
      parcel.onReturnLeg &&
      carrier.status === TripStatus.COMPLETED &&
      !!carrier.completedAt &&
      Date.now() - carrier.completedAt.getTime() < RETURN_PICKUP_DEADLINE_HOURS * HOUR;
    if (!CARRIER_ACTIVE_STATUSES.includes(carrier.status) && !returnPhase) throw new ConflictException('Course non active');
    return { parcel, carrier };
  }

  /**
   * Navette compatible, la plus tôt possible : course passager allant dans
   * le même sens, ou trajet retour (à vide) d'un chauffeur déjà engagé.
   */
  private async findCarrier(dto: ParcelQuoteDto): Promise<Carrier | null> {
    const desired = new Date(dto.scheduledAt).getTime();
    const from = new Date(Math.max(desired, Date.now() + MIN_LEAD_TIME_MS));
    const to = new Date(desired + GRAFT_WINDOW_HOURS * HOUR);
    const [outbound, back] = await Promise.all([this.findOutbound(dto, from, to), this.findReturnLeg(dto, from, to)]);
    if (outbound && back) {
      return (back.scheduledAt?.getTime() ?? Infinity) < (outbound.scheduledAt?.getTime() ?? Infinity) ? back : outbound;
    }
    return outbound ?? back;
  }

  /**
   * Trajet retour B → A d'un chauffeur engagé sur une course A → B : le
   * colis part de B (arrivée de la course) vers A (son départ). Seulement
   * si un chauffeur est attribué : sans lui, il n'y a pas de retour.
   */
  private async findReturnLeg(dto: ParcelQuoteDto, from: Date, to: Date): Promise<Carrier | null> {
    const candidates = await this.prisma.trip.findMany({
      where: {
        type: { in: ['passenger', 'mixed', 'parcel'] },
        status: { in: CARRIER_ACTIVE_STATUSES },
        driverId: { not: null },
        // Large : l'heure de retour dépend de la durée de l'aller.
        scheduledAt: { gte: new Date(from.getTime() - 24 * HOUR), lte: to },
      },
      select: {
        id: true, shuttleType: true, scheduledAt: true, durationMin: true, driverId: true,
        originLat: true, originLng: true, destinationLat: true, destinationLng: true,
      },
      orderBy: { scheduledAt: 'asc' },
      take: 200,
    });

    for (const c of candidates) {
      const departure = returnDepartureOf(c.scheduledAt, c.durationMin);
      if (!departure || departure < from || departure > to) continue;
      // Sens inverse : enlèvement près de l'arrivée, livraison près du départ.
      if (haversineKm(dto.pickup, { lat: c.destinationLat, lng: c.destinationLng }) > GRAFT_MAX_DETOUR_KM) continue;
      if (haversineKm(dto.delivery, { lat: c.originLat, lng: c.originLng }) > GRAFT_MAX_DETOUR_KM) continue;
      const aboard = await this.prisma.parcelBooking.findMany({
        where: { carrierTripId: c.id, onReturnLeg: true, status: { in: OPEN_PARCEL_STATUSES } },
        select: { weightKg: true },
      });
      const weight = aboard.reduce((s, p) => s + Number(p.weightKg ?? 0), 0);
      if (aboard.length >= MAX_RETURN_PARCELS || weight + dto.weightKg > MAX_RETURN_PARCEL_WEIGHT_KG) continue;
      return { id: c.id, shuttleType: c.shuttleType, scheduledAt: departure, durationMin: c.durationMin, onReturnLeg: true, driverId: c.driverId };
    }
    return null;
  }

  /** Course passager allant dans le même sens (à 3 km près), avec de la place. */
  private async findOutbound(dto: ParcelQuoteDto, from: Date, to: Date): Promise<Carrier | null> {
    const candidates = await this.prisma.trip.findMany({
      where: {
        type: { in: ['passenger', 'mixed'] },
        status: { in: CARRIER_OPEN_STATUSES },
        // Navette PMR : l'espace est réservé au fauteuil et à son matériel.
        shuttleType: { not: 'accessibility' },
        // Courses d'entreprise exclues : le client paie un transport privatif.
        corporateId: null,
        scheduledAt: { gte: from, lte: to },
      },
      select: {
        id: true, shuttleType: true, scheduledAt: true, durationMin: true, driverId: true,
        originLat: true, originLng: true, destinationLat: true, destinationLng: true,
      },
      orderBy: { scheduledAt: 'asc' },
      take: 200,
    });

    for (const c of candidates) {
      if (haversineKm(dto.pickup, { lat: c.originLat, lng: c.originLng }) > GRAFT_MAX_DETOUR_KM) continue;
      if (haversineKm(dto.delivery, { lat: c.destinationLat, lng: c.destinationLng }) > GRAFT_MAX_DETOUR_KM) continue;
      // Coffre partagé avec les bagages des passagers : capacité de l'aller.
      const aboard = await this.prisma.parcelBooking.findMany({
        where: { carrierTripId: c.id, onReturnLeg: false, status: { in: OPEN_PARCEL_STATUSES } },
        select: { weightKg: true },
      });
      const weight = aboard.reduce((s, p) => s + Number(p.weightKg ?? 0), 0);
      if (aboard.length >= MAX_PARCELS_PER_TRIP || weight + dto.weightKg > MAX_PARCEL_WEIGHT_PER_TRIP_KG) continue;
      return { id: c.id, shuttleType: c.shuttleType, scheduledAt: c.scheduledAt, durationMin: c.durationMin, onReturnLeg: false, driverId: c.driverId };
    }
    return null;
  }

  private async dedicatedQuote(dto: ParcelQuoteDto, jurisdiction: string) {
    const route = await this.routing.drivingRoute(dto.pickup, dto.delivery);
    // Distance minimale de la juridiction (60 km) vérifiée par PricingService.
    const quote = await this.pricing.estimate({
      distanceKm: route.distanceKm,
      shuttleType: DEDICATED_PARCEL_SHUTTLE,
      type: 'parcel',
      jurisdiction,
    });
    return { quote, distanceKm: route.distanceKm, durationMin: route.durationMin };
  }

  private validateParcel(dto: ParcelQuoteDto) {
    if (new Date(dto.scheduledAt).getTime() < Date.now() + MIN_LEAD_TIME_MS) {
      throw new BadRequestException('Envoi au moins 2 h à l’avance');
    }
    if (dto.weightKg > PARCEL_MAX_WEIGHT_KG) throw new BadRequestException(`Poids maximal : ${PARCEL_MAX_WEIGHT_KG} kg`);
    if (!fitsDimensions([dto.lengthCm, dto.widthCm, dto.heightCm])) {
      throw new BadRequestException('Dimensions maximales : 120 × 80 × 80 cm');
    }
    if (dto.pickup.lat === dto.delivery.lat && dto.pickup.lng === dto.delivery.lng) {
      throw new BadRequestException('Enlèvement et livraison identiques');
    }
  }

  private async storeImage(file: UploadedImage | undefined, prefix: string): Promise<string> {
    if (!file || file.size === 0) throw new BadRequestException('Photo requise');
    if (file.size > MAX_DOCUMENT_BYTES) throw new BadRequestException('Photo trop volumineuse (2 Mo maximum)');
    const type = detectFileType(file.buffer);
    if (!type || type.ext === 'pdf') throw new BadRequestException('Photo JPEG ou PNG uniquement');
    const key = `${prefix}-${randomUUID()}.${type.ext}`;
    await this.storage.put(key, file.buffer, type.mime);
    return key;
  }

  private async notifySender(senderId: string | null, type: string, title: string, body: string, parcelId: string) {
    if (senderId) await this.notifications.notify(senderId, type, title, body, { parcelId });
  }

  private async jurisdictionOf(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { jurisdiction: true, deletedAt: true } });
    if (!user || user.deletedAt) throw new UnauthorizedException('Compte introuvable ou désactivé');
    return user.jurisdiction;
  }

  private async rateLimit(key: string, windowSeconds: number, max: number, message: string) {
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, windowSeconds);
    if (count > max) throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

/** Comparaison à temps constant (pas d'indice par le temps de réponse). */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
