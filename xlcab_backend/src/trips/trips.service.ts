import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { DispatchService, SYSTEM_USER } from '../matching/dispatch.service';
import { MATCHABLE_STATUSES, TRACKING_LEAD_MIN, TripStatus, dispatchStartAt, driverTripKey } from '../matching/matching.constants';
import { PaymentsService } from '../payments/payments.service';
import { ParcelsService } from '../parcels/parcels.service';
import { InvoicesService } from '../invoices/invoices.service';
import { LinesService } from '../operators/lines.service';
import { TripPayoutsService } from '../payouts/trip-payouts';
import { cancellationFee } from './cancellation';

export interface RequestUser {
  sub: string;
  role: string;
}

export interface AuditCtx {
  ipAddress?: string;
  userAgent?: string;
}

// Statuts annulables par le passager (avant le départ).
const CANCELLABLE = [
  TripStatus.AWAITING_PAYMENT,
  TripStatus.ATTACHED,
  TripStatus.PENDING,
  TripStatus.SEARCHING,
  TripStatus.NO_DRIVER,
  TripStatus.ACCEPTED,
] as string[];

// Supprime driver:trip seulement s'il désigne encore CETTE course.
const COMPARE_AND_DELETE = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0`;

const DRIVER_TRIP_TTL_SECONDS = 12 * 3600;

/**
 * Cycle de vie d'une course après l'attribution (Partie 6 : start,
 * complete, cancel, GET /trips/:id). Le matching et l'acceptation sont
 * dans le module Matching (Module 4).
 */
@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private tracking: TrackingGateway,
    private notifications: NotificationsService,
    private audit: AuditService,
    private dispatch: DispatchService,
    private payments: PaymentsService,
    private parcels: ParcelsService,
    private invoices: InvoicesService,
    private lines: LinesService,
    private payouts: TripPayoutsService,
  ) {}

  // ── GET /trips/:id ──────────────────────────────────────────────────

  async getTrip(user: RequestUser, tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { priceLines: true, passengerBooking: true },
    });
    if (!trip || !(await this.canView(user, trip))) throw new NotFoundException('Trajet introuvable');

    const isPassenger = trip.passengerId === user.sub;
    const vehicle = trip.vehicleId
      ? await this.prisma.vehicle.findUnique({
          where: { id: trip.vehicleId },
          select: { brand: true, model: true, color: true, plate: true },
        })
      : null;
    const driver = trip.driverId
      ? await this.prisma.user.findUnique({ where: { id: trip.driverId }, select: { firstName: true } })
      : null;

    const b = trip.passengerBooking;
    // Sièges numérotés (ligne vendue à la place) : vides pour les autres courses.
    const seatNumbers = trip.lineDepartureId
      ? (await this.prisma.lineSeat.findMany({ where: { tripId: trip.id }, select: { seatNumber: true } })).map((r) => r.seatNumber).sort((x, y) => x - y)
      : [];
    return {
      id: trip.id,
      type: trip.type,
      // instant | line | market : « Réserver le retour » ouvre l'écran correspondant.
      source: trip.source,
      status: trip.status,
      shuttleType: trip.shuttleType,
      origin: { address: trip.originAddress, lat: trip.originLat, lng: trip.originLng },
      destination: { address: trip.destinationAddress, lat: trip.destinationLat, lng: trip.destinationLng },
      scheduledAt: trip.scheduledAt,
      // Course en attente de chauffeur : heure à laquelle la recherche
      // démarre (ou a démarré) — affichée sur l'écran 8.
      dispatchAt: MATCHABLE_STATUSES.includes(trip.status) ? dispatchStartAt(trip.scheduledAt) : null,
      distanceKm: trip.distanceKm == null ? null : Number(trip.distanceKm),
      durationMin: trip.durationMin,
      timeline: {
        createdAt: trip.createdAt,
        acceptedAt: trip.acceptedAt,
        startedAt: trip.startedAt,
        completedAt: trip.completedAt,
        cancelledAt: trip.cancelledAt,
      },
      price: {
        totalCents: trip.totalPriceCents,
        vatCents: trip.vatCents,
        lines: trip.priceLines.map((l) => ({
          regime: l.regime,
          baseCents: l.baseCents,
          ratePercent: Number(l.ratePercent),
          vatCents: l.vatCents,
        })),
      },
      booking: b
        ? {
            seats: b.seats,
            seatNumbers,
            childSeats: b.childSeats,
            wifi: b.wifiRequested,
            extraLuggage: b.extraLuggage,
            checkedIn: b.checkedIn,
            // QR d'embarquement (écran 8) : au seul passager, jamais au chauffeur
            // (qui doit le scanner, pas le recopier).
            qrCode: isPassenger ? b.qrCode : undefined,
          }
        : null,
      driver: trip.driverId ? { firstName: driver?.firstName ?? null, vehicle } : null,
      cancellation: trip.cancelledAt
        ? { reason: trip.cancellationReason, feeCents: trip.cancellationFeeCents ?? 0 }
        : null,
      // Facture (téléchargeable par le client sur l'écran 8).
      invoice: isPassenger && !trip.corporateId ? await this.invoices.forTrip(tripId) : null,
    };
  }

  // ── POST /trips/:id/start ───────────────────────────────────────────

  async start(user: RequestUser, tripId: string, qrCode: string | undefined, ctx: AuditCtx) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { passengerBooking: true } });
    if (!trip || trip.driverId !== user.sub) throw new NotFoundException('Trajet introuvable');
    if (trip.status !== TripStatus.ACCEPTED) {
      throw new ConflictException('Cette course ne peut pas être démarrée');
    }

    // Pas de démarrage plus d'1 h avant l'heure prévue (évite qu'une course
    // soit "démarrée" par erreur ou fraude des jours à l'avance).
    const now = new Date();
    if (trip.scheduledAt && trip.scheduledAt.getTime() - now.getTime() > TRACKING_LEAD_MIN * 60_000) {
      throw new ConflictException('Trop tôt : la course ne peut démarrer qu’une heure avant le départ prévu');
    }

    // Partie 8 : "Dashcam obligatoire (vérifiée au démarrage)".
    const vehicle = trip.vehicleId
      ? await this.prisma.vehicle.findUnique({ where: { id: trip.vehicleId }, select: { dashcamActive: true } })
      : null;
    if (!vehicle?.dashcamActive) {
      throw new ConflictException('Dashcam inactive : démarrage impossible (obligatoire pour toute course)');
    }

    // Scan du QR code du passager (écran 15) : preuve de prise en charge.
    if (qrCode !== undefined) {
      if (!trip.passengerBooking || trip.passengerBooking.qrCode !== qrCode) {
        throw new BadRequestException('QR code invalide pour cette course');
      }
      await this.prisma.passengerBooking.update({ where: { tripId }, data: { checkedIn: true } });
    }

    // Course colis dédiée : le colis doit avoir été scanné à l'enlèvement.
    await this.parcels.assertReadyToStart(tripId, trip.type);

    const updated = await this.prisma.trip.updateMany({
      where: { id: tripId, status: TripStatus.ACCEPTED },
      data: { status: TripStatus.STARTED, startedAt: now },
    });
    if (updated.count === 0) throw new ConflictException('Cette course ne peut pas être démarrée');

    await this.redis.set(driverTripKey(user.sub), tripId, 'EX', DRIVER_TRIP_TTL_SECONDS);
    this.tracking.emitTripStatus(tripId, TripStatus.STARTED);
    // Colis à bord : en transit (les colis jamais remis sont signalés).
    await this.parcels.onTripStarted(tripId, user.sub);
    if (trip.passengerId) {
      await this.notifications.notify(trip.passengerId, 'trip.started', 'Course démarrée', 'Bon voyage avec XLCAB !', { tripId });
    }
    await this.audit.log({ userId: user.sub, action: 'trip.start', entity: 'Trip', entityId: tripId, metadata: { qrScanned: qrCode !== undefined }, ...ctx });
    return { tripId, status: TripStatus.STARTED, startedAt: now, checkedIn: qrCode !== undefined };
  }

  // ── POST /trips/:id/complete ────────────────────────────────────────

  async complete(user: RequestUser, tripId: string, ctx: AuditCtx) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip || trip.driverId !== user.sub) throw new NotFoundException('Trajet introuvable');

    // Aucun colis ne doit rester à bord (remis ou signalé).
    await this.parcels.assertNoParcelOnBoard(tripId);

    const now = new Date();
    const updated = await this.prisma.trip.updateMany({
      where: { id: tripId, status: TripStatus.STARTED },
      data: { status: TripStatus.COMPLETED, completedAt: now },
    });
    if (updated.count === 0) throw new ConflictException('Seule une course en cours peut être terminée');

    await this.releaseDriver(user.sub, tripId);
    await this.prisma.driverProfile.update({ where: { id: user.sub }, data: { totalTrips: { increment: 1 } } });
    this.tracking.emitTripStatus(tripId, TripStatus.COMPLETED);
    if (trip.passengerId) {
      await this.notifications.notify(trip.passengerId, 'trip.completed', 'Course terminée', 'Merci d’avoir voyagé avec XLCAB.', { tripId });
    }
    await this.audit.log({ userId: user.sub, action: 'trip.complete', entity: 'Trip', entityId: tripId, ...ctx });
    // Facture du particulier (déjà payée) ; les entreprises sont facturées au mois.
    await this.invoices.issueForTrip(tripId);
    // Ligne ou bourse payée en ligne : part de l'opérateur virée sur son compte de versement.
    await this.payouts.onTripCompleted(tripId, now);
    return { tripId, status: TripStatus.COMPLETED, completedAt: now };
  }

  // ── POST /trips/:id/cancel ──────────────────────────────────────────

  /**
   * Trois cas :
   * - le chauffeur attribué se désiste (avant le départ) : la course
   *   repart en recherche d'un autre chauffeur, sans frais pour le passager ;
   * - le passager, ou l'admin de l'entreprise qui a réservé, annule :
   *   frais selon les CGV (Partie 13) ;
   * - un admin XLCAB annule (incident, fraude…) : sans frais, même en cours.
   */
  async cancel(user: RequestUser, tripId: string, reason: string, ctx: AuditCtx) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trajet introuvable');

    if (user.role === 'driver' && trip.driverId === user.sub) {
      return this.driverWithdraw(user, trip, reason, ctx);
    }

    const isAdmin = user.role === 'admin';
    const isOwner = trip.passengerId === user.sub || (await this.isCorporateAdminOf(user, trip.corporateId));
    if (!isAdmin && !isOwner) throw new NotFoundException('Trajet introuvable');

    const allowed = isAdmin ? [...CANCELLABLE, TripStatus.STARTED] : CANCELLABLE;
    if (!allowed.includes(trip.status)) {
      throw new ConflictException(
        trip.status === TripStatus.STARTED ? 'Course en cours : annulation impossible' : 'Cette course ne peut plus être annulée',
      );
    }

    // Colis : annulable seulement avant l'enlèvement.
    if (trip.type === 'parcel') await this.parcels.assertCancellable(tripId);

    const now = new Date();
    // Frais des CGV seulement si un chauffeur était engagé : facturer une
    // course que XLCAB n'a pas pu assurer (aucun chauffeur trouvé) serait
    // abusif. Annulation par un admin XLCAB : jamais de frais.
    const fee =
      !isAdmin && trip.status === TripStatus.ACCEPTED
        ? cancellationFee(trip.totalPriceCents, trip.scheduledAt, now)
        : { percent: 0, feeCents: 0 };
    const updated = await this.prisma.trip.updateMany({
      where: { id: tripId, status: { in: allowed } },
      data: { status: TripStatus.CANCELLED, cancelledAt: now, cancellationReason: reason, cancellationFeeCents: fee.feeCents },
    });
    if (updated.count === 0) throw new ConflictException('Cette course ne peut plus être annulée');

    if (trip.driverId) {
      await this.releaseDriver(trip.driverId, tripId);
      await this.notifications.notify(trip.driverId, 'trip.cancelled', 'Course annulée', 'Une course qui vous était attribuée a été annulée.', { tripId });
    }
    this.tracking.emitTripStatus(tripId, TripStatus.CANCELLED);

    // Colis : statut du colis ; course passager : ses colis greffés sont
    // annulés et remboursés intégralement.
    if (trip.type === 'parcel') await this.parcels.markCancelled(tripId);
    else await this.parcels.onCarrierCancelled(tripId);

    // Place sur un départ de ligne : rendue à la vente.
    if (trip.lineDepartureId) {
      const booking = await this.prisma.passengerBooking.findUnique({ where: { tripId }, select: { seats: true } });
      await this.lines.releaseSeats(trip.lineDepartureId, booking?.seats ?? 0, tripId);
    }

    // Remboursement Stripe (montant payé − frais). Sans effet pour une
    // course d'entreprise (facturation mensuelle) ; un incident Stripe ne
    // remet pas en cause l'annulation (tracé pour reprise manuelle).
    const refund = await this.payments.refundForCancellation(tripId, fee.feeCents);
    // Frais retenus : facturés (indemnité d'annulation).
    if (fee.feeCents > 0 && !trip.corporateId) await this.invoices.issueCancellationFee(tripId, fee.feeCents);

    await this.audit.log({
      userId: user.sub, action: 'trip.cancel', entity: 'Trip', entityId: tripId,
      metadata: { reason, by: isAdmin ? 'admin' : 'client', feePercent: fee.percent, feeCents: fee.feeCents, refundedCents: refund.refundedCents }, ...ctx,
    });
    return {
      tripId,
      status: TripStatus.CANCELLED,
      feePercent: fee.percent,
      feeCents: fee.feeCents,
      refundedCents: refund.refundedCents,
      ...(refund.failed ? { refundPending: true } : {}),
    };
  }

  private async driverWithdraw(
    user: RequestUser,
    trip: { id: string; status: string; passengerId: string | null; lineDepartureId: string | null },
    reason: string,
    ctx: AuditCtx,
  ) {
    // Ligne régulière : le chauffeur annule le départ entier (protocole de secours), pas une réservation.
    if (trip.lineDepartureId) {
      throw new ConflictException('Course de ligne régulière : annulez le départ depuis vos lignes, un chauffeur de secours prendra le relais');
    }
    if (trip.status !== TripStatus.ACCEPTED) {
      throw new ConflictException(
        trip.status === TripStatus.STARTED ? 'Course en cours : terminez-la ou contactez le support' : 'Désistement impossible',
      );
    }
    const updated = await this.prisma.trip.updateMany({
      where: { id: trip.id, status: TripStatus.ACCEPTED, driverId: user.sub },
      data: { status: TripStatus.PENDING, driverId: null, vehicleId: null, acceptedAt: null },
    });
    if (updated.count === 0) throw new ConflictException('Désistement impossible');

    await this.releaseDriver(user.sub, trip.id);
    // Les colis de son trajet retour n'ont plus de transporteur.
    await this.parcels.onDriverWithdrew(trip.id);
    await this.audit.log({ userId: user.sub, action: 'trip.driver_withdraw', entity: 'Trip', entityId: trip.id, metadata: { reason }, ...ctx });
    if (trip.passengerId) {
      await this.notifications.notify(
        trip.passengerId, 'trip.driver_withdrew', 'Changement de chauffeur',
        'Votre chauffeur s’est désisté. Nous recherchons un autre chauffeur, sans frais pour vous.', { tripId: trip.id },
      );
    }

    // Nouvelle recherche automatique (au nom du système).
    try {
      const res = await this.dispatch.startMatching(SYSTEM_USER, trip.id);
      return { tripId: trip.id, status: res.status, withdrawn: true };
    } catch (err) {
      this.logger.error(`Nouvelle recherche impossible (trip ${trip.id}) : ${(err as Error).message}`);
      this.tracking.emitTripStatus(trip.id, TripStatus.PENDING);
      return { tripId: trip.id, status: TripStatus.PENDING, withdrawn: true };
    }
  }

  // ── Utilitaires ─────────────────────────────────────────────────────

  /** Le chauffeur n'est plus suivi pour cette course (contrat Module 3). */
  private async releaseDriver(driverId: string, tripId: string) {
    await this.redis.eval(COMPARE_AND_DELETE, 1, driverTripKey(driverId), tripId);
  }

  private async canView(user: RequestUser, trip: { passengerId: string | null; driverId: string | null; corporateId: string | null }) {
    if (user.role === 'admin') return true;
    if (trip.passengerId === user.sub || trip.driverId === user.sub) return true;
    return this.isCorporateAdminOf(user, trip.corporateId);
  }

  private async isCorporateAdminOf(user: RequestUser, corporateId: string | null): Promise<boolean> {
    if (!corporateId || user.role !== 'corporate_admin') return false;
    const m = await this.prisma.corporateMember.findFirst({
      where: { userId: user.sub, corporateId, role: 'admin', isActive: true },
      select: { id: true },
    });
    return Boolean(m);
  }
}
