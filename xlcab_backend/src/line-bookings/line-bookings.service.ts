import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { LineDeparture, RecurringLine } from '@prisma/client';
import { randomInt, randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { driverCommissionPercent } from '../driver-mode/driver-mode.service';
import { TRACKING_LEAD_MIN, TripStatus } from '../matching/matching.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { linePaymentMode } from '../payouts/payment-mode';
import { pointIndex, segmentFare } from '../operators/line-stops';
import { LinesService } from '../operators/lines.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuditCtx, RequestUser, TripsService } from '../trips/trips.service';
import { BookLineDto, LineParcelDto } from './dto';
import { READY_WINDOW_MIN } from './protocol.constants';
import { ParcelsService } from '../parcels/parcels.service';
import { fitsDimensions } from '../parcels/parcels.constants';

const BOOKINGS_MAX_PER_HOUR = 10;
const ACTIVE = [TripStatus.ACCEPTED, TripStatus.STARTED] as string[];

// Mode de paiement des lignes et de la bourse : voir payouts/payment-mode.ts.
// « deferred » = réservation sans encaissement (tests), refusé en production.
export { linePaymentMode };

/** Chauffeur qui assure le départ : affecté (secours) sinon titulaire de la ligne. */
export const assignedDriver = (d: LineDeparture, line: RecurringLine) => d.driverId ?? line.operatorId;
export const assignedVehicle = (d: LineDeparture, line: RecurringLine) => d.vehicleId ?? line.vehicleId;

/**
 * Réservations de places sur les départs des lignes régulières (bourse,
 * étape 2a). Chaque réservation est une course XLCAB ordinaire (Trip
 * source "line", déjà acceptée par le chauffeur du départ) : suivi, QR,
 * annulation selon les CGV, facture et avis fonctionnent sans changement.
 * Le chauffeur opère le départ en bloc (liste d'embarquement, démarrage,
 * fin).
 */
@Injectable()
export class LineBookingsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private lines: LinesService,
    private trips: TripsService,
    private notifications: NotificationsService,
    private audit: AuditService,
    private payments: PaymentsService,
    private parcels: ParcelsService,
  ) {}

  // ── Réservation (passager) ──────────────────────────────────────────

  async book(userId: string, dto: BookLineDto, now = new Date()) {
    // « connect » : le passager paie à la réservation (Stripe). « deferred » : sans
    // encaissement, pour les tests seulement — jamais de vente réelle ainsi.
    const online = linePaymentMode() === 'connect';
    if (!online && process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException('Réservation sur les lignes régulières bientôt disponible');
    }
    if (online && !this.payments.available()) throw new ServiceUnavailableException('Paiement momentanément indisponible');
    const key = `line:booking:rate:${userId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 3600);
    if (count > BOOKINGS_MAX_PER_HOUR) {
      throw new HttpException('Trop de réservations — réessayez plus tard', HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { deletedAt: true, firstName: true } });
    if (!user || user.deletedAt) throw new UnauthorizedException('Compte introuvable ou désactivé');

    const departure = await this.prisma.lineDeparture.findUnique({ where: { id: dto.departureId } });
    if (!departure) throw new NotFoundException('Départ introuvable');
    const line = await this.prisma.recurringLine.findUnique({ where: { id: departure.lineId } });
    if (!line) throw new NotFoundException('Départ introuvable');
    if (assignedDriver(departure, line) === userId || line.operatorId === userId) {
      throw new ForbiddenException('Vous assurez ce départ : vous ne pouvez pas y réserver de place');
    }
    if (dto.luggage !== undefined && dto.luggage > line.luggage) {
      throw new BadRequestException(`${line.luggage} bagages au maximum sur ce départ`);
    }
    const mine = await this.prisma.trip.count({
      // Une réservation en attente de paiement compte : elle retient déjà des places.
      where: { lineDepartureId: departure.id, passengerId: userId, type: 'passenger', status: { in: [...ACTIVE, TripStatus.AWAITING_PAYMENT] } },
    });
    if (mine > 0) throw new ConflictException('Vous avez déjà une réservation sur ce départ');

    const perSeat = departure.pricingMode === 'per_seat';
    // Tronçon : montée et descente parmi le départ, les arrêts et l'arrivée (sens du départ).
    const route = await this.lines.routeOf(departure, line);
    const from = pointIndex(route, dto.boardStopId, 'board');
    const to = pointIndex(route, dto.alightStopId, 'alight');
    if (from < 0 || to < 0 || from >= to || (!perSeat && (dto.boardStopId || dto.alightStopId))) {
      throw new BadRequestException('Arrêts invalides pour ce départ');
    }
    const board = route[from];
    const alight = route[to];
    const fullTrip = from === 0 && to === route.length - 1;
    if (dto.seatNumbers) {
      if (!perSeat) throw new BadRequestException('Ce départ se réserve en entier : pas de choix de siège');
      if (dto.seatNumbers.length !== dto.seats) throw new BadRequestException('Choisissez autant de sièges que de places');
      if (dto.seatNumbers.some((n) => n > departure.seatsTotal)) throw new BadRequestException('Ce siège n’existe pas sur ce départ');
      // Siège déjà vendu : refus avant de retenir quoi que ce soit (la contrainte
      // d'unicité de la base tranche ensuite les demandes simultanées).
      const clash = await this.prisma.lineSeat.count({ where: { departureId: departure.id, seatNumber: { in: dto.seatNumbers } } });
      if (clash > 0) throw new ConflictException('Ce siège vient d’être pris : choisissez-en un autre');
    }

    // Places retenues d'abord (écriture conditionnelle) : pas de survente.
    const held = await this.lines.reserveSeats(departure.id, dto.seats, now);
    const vehicleId = assignedVehicle(departure, line);
    const driverId = assignedDriver(departure, line);
    try {
      const [vehicle, config] = await Promise.all([
        this.prisma.vehicle.findUnique({ where: { id: vehicleId } }),
        this.prisma.jurisdictionConfig.findUnique({ where: { code: line.jurisdiction } }),
      ]);
      // Prix du tronçon (vente à la place) ; trajet complet ou véhicule : prix du départ.
      const total = perSeat && !fullTrip ? segmentFare(route, from, to) * dto.seats : held.priceCents;
      const rate = Number(config?.vatPassengerRate ?? 0);
      const base = Math.round(total / (1 + rate / 100));
      const commissionCents = Math.round((base * driverCommissionPercent()) / 100);

      const trip = await this.prisma.$transaction(async (tx) => {
        const created = await tx.trip.create({
          data: {
            type: 'passenger',
            // Paiement en ligne : confirmée (« acceptée ») seulement une fois payée.
            status: online ? TripStatus.AWAITING_PAYMENT : TripStatus.ACCEPTED,
            source: 'line',
            lineDepartureId: departure.id,
            passengerId: userId,
            driverId,
            vehicleId,
            acceptedAt: online ? null : now,
            shuttleType: vehicle?.shuttleType ?? 'bleue',
            // Montée et descente du passager : point de rencontre ou extrémité de la ligne.
            originAddress: board.address,
            originLat: board.lat,
            originLng: board.lng,
            destinationAddress: alight.address,
            destinationLat: alight.lat,
            destinationLng: alight.lng,
            durationMin: line.durationMin ? alight.offsetMin - board.offsetMin : null,
            scheduledAt: new Date(departure.departureAt.getTime() + board.offsetMin * 60_000),
            totalPriceCents: total,
            vatCents: total - base,
            commissionCents,
            jurisdiction: line.jurisdiction,
            priceLines: { create: [{ regime: 'passenger', baseCents: base, ratePercent: rate, vatCents: total - base }] },
          },
          select: { id: true },
        });
        await tx.passengerBooking.create({
          data: {
            tripId: created.id,
            seats: dto.seats,
            childSeats: dto.childSeats ?? 0,
            extraLuggage: (dto.luggage ?? 0) > dto.seats,
            qrCode: randomUUID(),
            notes: dto.notes || null,
            boardStopId: board.stopId,
            alightStopId: alight.stopId,
          },
        });
        // Sièges numérotés (vente à la place) : ceux choisis, sinon les premiers libres.
        const seatNumbers = perSeat ? await this.assignSeats(tx, departure.id, created.id, dto.seats, departure.seatsTotal, dto.seatNumbers) : [];
        return { ...created, seatNumbers };
      });

      if (online) return await this.awaitingPayment(userId, trip, departure, dto.seats, total);

      await this.notifications.notify(userId, 'line.booked', 'Réservation confirmée', 'Votre place sur la ligne est réservée.', { tripId: trip.id });
      await this.notifications.notify(driverId, 'line.new_booking', 'Nouvelle réservation', 'Un passager a réservé sur votre ligne.', {
        departureId: departure.id,
      });
      await this.audit.log({
        userId, action: 'line.book', entity: 'Trip', entityId: trip.id, metadata: { departureId: departure.id, seats: dto.seats, totalCents: total },
      });
      // Seuil de départ : cette réservation l'a peut-être atteint (« Départ confirmé »).
      await this.lines.guaranteeIfReached(departure.id, now);
      return {
        tripId: trip.id,
        status: TripStatus.ACCEPTED,
        departureAt: departure.departureAt,
        seats: dto.seats,
        seatNumbers: trip.seatNumbers,
        totalPriceCents: total,
        paymentMode: 'deferred',
        guarantee: await this.lines.guaranteeById(departure.id),
      };
    } catch (err) {
      // Course non créée : les places retenues sont rendues.
      await this.lines.releaseSeats(departure.id, dto.seats);
      throw err;
    }
  }

  // ── Colis (CLARIFICATION_MODELE.md, D9) ─────────────────────────────

  /**
   * Colis confié à un départ de ligne : remis au chauffeur au point de montée
   * (QR de l'expéditeur), récupéré à l'arrivée ou à un arrêt avec le code de
   * remise et une photo — le circuit du module Colis, inchangé. Le colis a sa
   * propre course (type parcel, source line) : paiement, facture, reversement
   * à l'opérateur et annulation fonctionnent comme pour une place.
   */
  async bookParcel(userId: string, dto: LineParcelDto, now = new Date()) {
    const online = linePaymentMode() === 'connect';
    if (!online && process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException('Réservation sur les lignes régulières bientôt disponible');
    }
    if (online && !this.payments.available()) throw new ServiceUnavailableException('Paiement momentanément indisponible');
    const key = `line:booking:rate:${userId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 3600);
    if (count > BOOKINGS_MAX_PER_HOUR) throw new HttpException('Trop de réservations — réessayez plus tard', HttpStatus.TOO_MANY_REQUESTS);
    if (!fitsDimensions([dto.lengthCm, dto.widthCm, dto.heightCm])) throw new BadRequestException('Colis trop grand : 120 × 80 × 80 cm au maximum');

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { deletedAt: true } });
    if (!user || user.deletedAt) throw new UnauthorizedException('Compte introuvable ou désactivé');
    const departure = await this.prisma.lineDeparture.findUnique({ where: { id: dto.departureId } });
    const line = departure && (await this.prisma.recurringLine.findUnique({ where: { id: departure.lineId } }));
    if (!departure || !line) throw new NotFoundException('Départ introuvable');
    if (assignedDriver(departure, line) === userId || line.operatorId === userId) {
      throw new ForbiddenException('Vous assurez ce départ : vous ne pouvez pas y confier de colis');
    }
    const route = await this.lines.routeOf(departure, line);
    const from = pointIndex(route, dto.boardStopId, 'board');
    const to = pointIndex(route, dto.alightStopId, 'alight');
    if (from < 0 || to < 0 || from >= to) throw new BadRequestException('Arrêts invalides pour ce départ');
    const board = route[from];
    const alight = route[to];

    // Emplacement retenu d'abord (écriture conditionnelle) : jamais plus de colis que prévu.
    const held = await this.lines.reserveParcelSlot(departure.id, now);
    try {
      const config = await this.prisma.jurisdictionConfig.findUnique({ where: { code: line.jurisdiction } });
      const total = held.priceCents;
      // Transport de marchandises : TVA « colis » du pays (20 % en France).
      const rate = Number(config?.vatParcelRate ?? 20);
      const base = Math.round(total / (1 + rate / 100));
      const commissionCents = Math.round((base * driverCommissionPercent()) / 100);
      const vehicle = await this.prisma.vehicle.findUnique({ where: { id: assignedVehicle(departure, line) } });
      const searching = departure.rescueStatus === 'searching';
      const parcel = await this.prisma.$transaction(async (tx) => {
        const trip = await tx.trip.create({
          data: {
            type: 'parcel',
            status: online ? TripStatus.AWAITING_PAYMENT : TripStatus.ACCEPTED,
            source: 'line',
            lineDepartureId: departure.id,
            passengerId: userId, // expéditeur
            driverId: online || searching ? null : assignedDriver(departure, line),
            vehicleId: online || searching ? null : assignedVehicle(departure, line),
            acceptedAt: online ? null : now,
            shuttleType: vehicle?.shuttleType ?? 'bleue',
            originAddress: board.address,
            originLat: board.lat,
            originLng: board.lng,
            destinationAddress: alight.address,
            destinationLat: alight.lat,
            destinationLng: alight.lng,
            durationMin: line.durationMin ? alight.offsetMin - board.offsetMin : null,
            scheduledAt: new Date(departure.departureAt.getTime() + board.offsetMin * 60_000),
            totalPriceCents: total,
            vatCents: total - base,
            commissionCents,
            jurisdiction: line.jurisdiction,
            priceLines: { create: [{ regime: 'parcel', baseCents: base, ratePercent: rate, vatCents: total - base }] },
          },
          select: { id: true },
        });
        return tx.parcelBooking.create({
          data: {
            tripId: trip.id,
            senderId: userId,
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

      let payment;
      if (online) {
        try {
          payment = await this.payments.paymentSheet(userId, parcel.tripId);
        } catch (err) {
          await this.prisma.trip.updateMany({
            where: { id: parcel.tripId, status: TripStatus.AWAITING_PAYMENT },
            data: { status: TripStatus.CANCELLED, cancelledAt: new Date(), cancellationReason: 'Paiement indisponible', cancellationFeeCents: 0 },
          });
          await this.prisma.parcelBooking.update({ where: { id: parcel.id }, data: { status: 'cancelled' } });
          throw err;
        }
      } else {
        await this.notifications.notify(userId, 'line.parcel_booked', 'Colis confirmé',
          'Votre colis voyage sur la ligne. Présentez le QR au chauffeur au point de rendez-vous.', { parcelId: parcel.id });
        if (!searching) {
          await this.notifications.notify(assignedDriver(departure, line), 'line.new_parcel', 'Nouveau colis', 'Un colis vous sera remis au départ.', { departureId: departure.id });
        }
      }
      await this.audit.log({ userId, action: 'line.parcel.book', entity: 'ParcelBooking', entityId: parcel.id, metadata: { departureId: departure.id, totalCents: total } });
      return {
        parcelId: parcel.id,
        tripId: parcel.tripId,
        status: online ? TripStatus.AWAITING_PAYMENT : TripStatus.ACCEPTED,
        departureAt: new Date(departure.departureAt.getTime() + board.offsetMin * 60_000),
        pickup: board.name,
        delivery: alight.name,
        totalPriceCents: total,
        paymentMode: online ? 'connect' : 'deferred',
        ...(payment ? { payment } : {}),
        guarantee: await this.lines.guaranteeById(departure.id),
      };
    } catch (err) {
      await this.lines.releaseParcelSlot(departure.id);
      throw err;
    }
  }

  /**
   * Paiement en ligne : la réservation retient ses places et attend son
   * paiement (feuille Stripe renvoyée à l'app). Confirmée par
   * PaymentsService.markPaid ; non payée au bout de 30 min, elle est
   * annulée par le planificateur et ses places reviennent à la vente.
   */
  private async awaitingPayment(userId: string, trip: { id: string; seatNumbers: number[] }, departure: LineDeparture, seats: number, total: number) {
    let payment;
    try {
      payment = await this.payments.paymentSheet(userId, trip.id);
    } catch (err) {
      // Stripe en panne : la réservation est annulée tout de suite (le bloc
      // appelant rend les places), le passager peut réessayer sans attendre.
      await this.prisma.trip.updateMany({
        where: { id: trip.id, status: TripStatus.AWAITING_PAYMENT },
        data: { status: TripStatus.CANCELLED, cancelledAt: new Date(), cancellationReason: 'Paiement indisponible', cancellationFeeCents: 0 },
      });
      await this.prisma.lineSeat.deleteMany({ where: { departureId: departure.id, tripId: trip.id } });
      throw err;
    }
    await this.audit.log({
      userId, action: 'line.book', entity: 'Trip', entityId: trip.id, metadata: { departureId: departure.id, seats, totalCents: total, payment: 'connect' },
    });
    return {
      tripId: trip.id,
      status: TripStatus.AWAITING_PAYMENT,
      departureAt: departure.departureAt,
      seats,
      seatNumbers: trip.seatNumbers,
      totalPriceCents: total,
      paymentMode: 'connect',
      payment,
      guarantee: await this.lines.guaranteeById(departure.id),
    };
  }

  /**
   * Attribue des sièges à une réservation. La contrainte d'unicité de la
   * base tranche si deux clients visent le même siège au même instant :
   * le second reçoit un 409 et sa réservation n'est pas créée.
   */
  private async assignSeats(tx: any, departureId: string, tripId: string, count: number, seatsTotal: number, wanted?: number[]) {
    const taken = new Set<number>((await tx.lineSeat.findMany({ where: { departureId }, select: { seatNumber: true } })).map((s: { seatNumber: number }) => s.seatNumber));
    let numbers: number[];
    if (wanted) {
      if (wanted.some((n) => taken.has(n))) throw new ConflictException('Ce siège vient d’être pris : choisissez-en un autre');
      numbers = [...wanted].sort((a, b) => a - b);
    } else {
      numbers = [];
      for (let n = 1; n <= seatsTotal && numbers.length < count; n++) if (!taken.has(n)) numbers.push(n);
    }
    try {
      for (const seatNumber of numbers) await tx.lineSeat.create({ data: { departureId, seatNumber, tripId } });
    } catch (err: any) {
      if (err?.code === 'P2002') throw new ConflictException('Ce siège vient d’être pris : choisissez-en un autre');
      throw err;
    }
    return numbers;
  }

  /** Plan des sièges d'un départ : ceux déjà pris (aucune identité), pour le choix à la réservation. */
  async seatMap(departureId: string) {
    const departure = await this.prisma.lineDeparture.findUnique({ where: { id: departureId } });
    if (!departure) throw new NotFoundException('Départ introuvable');
    const rows = await this.prisma.lineSeat.findMany({ where: { departureId }, select: { seatNumber: true } });
    return {
      departureId,
      seatsTotal: departure.seatsTotal,
      // Un départ privatisé (prix au véhicule) ne propose pas de choix de siège.
      choosable: departure.pricingMode === 'per_seat',
      taken: rows.map((r: { seatNumber: number }) => r.seatNumber).sort((a: number, b: number) => a - b),
    };
  }

  // ── Départ côté chauffeur ───────────────────────────────────────────

  /** Départ assuré par ce chauffeur (titulaire ou secours), sinon 404. */
  async ownDeparture(userId: string, departureId: string) {
    const departure = await this.prisma.lineDeparture.findUnique({ where: { id: departureId } });
    const line = departure && (await this.prisma.recurringLine.findUnique({ where: { id: departure.lineId } }));
    if (!departure || !line || assignedDriver(departure, line) !== userId || departure.rescueStatus === 'searching') {
      throw new NotFoundException('Départ introuvable');
    }
    return { departure, line };
  }

  /**
   * Départs réservés que ce chauffeur assure : ceux de ses lignes et ceux
   * qu'il a repris en secours (jusqu'à 6 h après l'heure de départ).
   */
  async assignments(userId: string, now = new Date()) {
    const own = await this.prisma.recurringLine.findMany({ where: { operatorId: userId }, select: { id: true } });
    const departures = await this.prisma.lineDeparture.findMany({
      where: {
        seatsBooked: { gt: 0 },
        departureAt: { gt: new Date(now.getTime() - 6 * 3600_000) },
        rescueStatus: { in: ['none', 'rescued'] },
        OR: [{ driverId: userId }, { driverId: null, lineId: { in: own.map((l) => l.id) } }],
      },
      orderBy: { departureAt: 'asc' },
    });
    const result = [];
    for (const d of departures) {
      const line = await this.prisma.recurringLine.findUnique({ where: { id: d.lineId } });
      if (!line || assignedDriver(d, line) !== userId) continue;
      const trips = await this.prisma.trip.findMany({
        where: { lineDepartureId: d.id, status: { in: [...ACTIVE, TripStatus.COMPLETED] } },
        include: { passengerBooking: true },
      });
      const active = trips.filter((t) => ACTIVE.includes(t.status));
      const parcelsOnDeparture = active.filter((t) => t.type === 'parcel').length;
      if (active.length === 0) continue; // départ terminé ou toutes les réservations annulées
      const outbound = d.direction === 'outbound';
      result.push({
        departureId: d.id,
        lineId: line.id,
        departureAt: d.departureAt,
        origin: outbound ? line.originAddress : line.destinationAddress,
        destination: outbound ? line.destinationAddress : line.originAddress,
        passengers: active.reduce((n, t) => n + (t.passengerBooking?.seats ?? 0), 0),
        bookings: active.length - parcelsOnDeparture,
        parcels: parcelsOnDeparture,
        started: active.some((t) => t.status === TripStatus.STARTED),
        ready: d.driverReadyAt !== null,
        rescued: d.rescueStatus === 'rescued',
        guarantee: await this.lines.guaranteeOf(d, line),
      });
    }
    return result;
  }

  /** Liste d'embarquement : prénom, places, présence ; téléphone à T−60 min seulement. */
  async manifest(userId: string, departureId: string, now = new Date()) {
    const { departure, line } = await this.ownDeparture(userId, departureId);
    const all = await this.prisma.trip.findMany({
      where: { lineDepartureId: departureId, status: { in: ACTIVE } },
      include: { passengerBooking: true },
      orderBy: { createdAt: 'asc' },
    });
    const trips = all.filter((t) => t.type !== 'parcel');
    const parcelTrips = all.filter((t) => t.type === 'parcel').map((t) => t.id);
    const showPhone = departure.departureAt.getTime() - now.getTime() <= TRACKING_LEAD_MIN * 60_000;
    const users = await this.prisma.user.findMany({
      where: { id: { in: trips.map((t) => t.passengerId!).filter(Boolean) } },
      select: { id: true, firstName: true, phone: true },
    });
    const seatRows = await this.prisma.lineSeat.findMany({ where: { departureId }, select: { seatNumber: true, tripId: true } });
    const seatsOf = (tripId: string) =>
      seatRows.filter((s: { tripId: string }) => s.tripId === tripId).map((s: { seatNumber: number }) => s.seatNumber).sort((a: number, b: number) => a - b);
    const outbound = departure.direction === 'outbound';
    return {
      departureId,
      lineId: line.id,
      departureAt: departure.departureAt,
      origin: outbound ? line.originAddress : line.destinationAddress,
      destination: outbound ? line.destinationAddress : line.originAddress,
      ready: departure.driverReadyAt !== null,
      // Ouverture de « Je suis en route » : l'appli masque le bouton avant.
      readyOpensAt: new Date(departure.departureAt.getTime() - READY_WINDOW_MIN * 60_000),
      seatsBooked: trips.reduce((n, t) => n + (t.passengerBooking?.seats ?? 0), 0),
      guarantee: await this.lines.guaranteeOf(departure, line),
      // Colis du départ : même fiche que la checklist des missions (QR, code de remise, photo).
      parcels: [...(await this.parcels.checklistFor(parcelTrips, showPhone ? new Set(parcelTrips) : new Set())).values()].flat(),
      passengers: trips.map((t) => {
        const u = users.find((x) => x.id === t.passengerId);
        return {
          tripId: t.id,
          firstName: u?.firstName ?? null,
          phone: showPhone ? u?.phone ?? null : null,
          seats: t.passengerBooking?.seats ?? 0,
          seatNumbers: seatsOf(t.id),
          childSeats: t.passengerBooking?.childSeats ?? 0,
          checkedIn: t.passengerBooking?.checkedIn ?? false,
          // Arrêts : montée / descente (adresse du point, ou extrémité de la ligne).
          pickup: t.originAddress,
          dropoff: t.destinationAddress,
          pickupAt: t.scheduledAt,
          status: t.status,
          notes: t.passengerBooking?.notes ?? null,
        };
      }),
    };
  }

  /** « Je suis en route » : évite le déclenchement du secours à T−60 min. */
  async ready(userId: string, departureId: string, now = new Date()) {
    const { departure } = await this.ownDeparture(userId, departureId);
    if (departure.departureAt.getTime() - now.getTime() > READY_WINDOW_MIN * 60_000) {
      throw new ConflictException('Trop tôt : confirmez votre départ dans les 3 heures qui précèdent');
    }
    await this.prisma.lineDeparture.update({ where: { id: departureId }, data: { driverReadyAt: now } });
    await this.audit.log({ userId, action: 'line.departure.ready', entity: 'LineDeparture', entityId: departureId });
    return { departureId, readyAt: now };
  }

  /** Scan du QR d'un passager du départ. */
  async checkIn(userId: string, departureId: string, qrCode: string) {
    await this.ownDeparture(userId, departureId);
    const booking = await this.prisma.passengerBooking.findUnique({ where: { qrCode }, include: { trip: true } });
    if (!booking || booking.trip.lineDepartureId !== departureId || !ACTIVE.includes(booking.trip.status)) {
      throw new BadRequestException('QR code invalide pour ce départ');
    }
    await this.prisma.passengerBooking.update({ where: { tripId: booking.tripId }, data: { checkedIn: true } });
    const user = booking.trip.passengerId
      ? await this.prisma.user.findUnique({ where: { id: booking.trip.passengerId }, select: { firstName: true } })
      : null;
    return { tripId: booking.tripId, firstName: user?.firstName ?? null, seats: booking.seats, checkedIn: true };
  }

  /** Démarre toutes les réservations du départ (mêmes contrôles qu'une course : dashcam, T−60 min). */
  async start(user: RequestUser, departureId: string, ctx: AuditCtx) {
    await this.ownDeparture(user.sub, departureId);
    // Colis jamais remis au chauffeur : signalés à l'équipe, ils ne bloquent pas les passagers.
    const pendingParcels = await this.prisma.trip.findMany({ where: { lineDepartureId: departureId, status: TripStatus.ACCEPTED, type: 'parcel' }, select: { id: true } });
    for (const p of pendingParcels) await this.parcels.onLineDepartureStarted(p.id, user.sub);
    const trips = await this.prisma.trip.findMany({ where: { lineDepartureId: departureId, status: TripStatus.ACCEPTED }, select: { id: true } });
    if (trips.length === 0) throw new ConflictException('Aucune réservation à démarrer sur ce départ');
    for (const t of trips) await this.trips.start(user, t.id, undefined, ctx);
    return { departureId, started: trips.length };
  }

  async complete(user: RequestUser, departureId: string, ctx: AuditCtx) {
    await this.ownDeparture(user.sub, departureId);
    const trips = await this.prisma.trip.findMany({ where: { lineDepartureId: departureId, status: TripStatus.STARTED }, select: { id: true } });
    if (trips.length === 0) throw new ConflictException('Aucune réservation en cours sur ce départ');
    for (const t of trips) await this.trips.complete(user, t.id, ctx);
    return { departureId, completed: trips.length };
  }
}
