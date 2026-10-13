import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { TransportOffer, TransportRequest } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { localDateOf, localTimeOf } from '../common/local-time';
import { driverCommissionPercent } from '../driver-mode/driver-mode.service';
import { linePaymentMode } from '../payouts/payment-mode';
import { PayoutAccountsService } from '../payouts/payout-accounts';
import { TripStatus } from '../matching/matching.constants';
import { MatchingService } from '../matching/matching.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LinesService } from '../operators/lines.service';
import { haversineKm } from '../parcels/parcels.constants';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateOfferDto, CreateRequestDto, MarketQueryDto } from './dto';

/** Délai minimal entre la publication et le départ (comme la réservation classique). */
export const REQUEST_MIN_LEAD_MIN = 120;
/** Plus aucune confirmation dans l'heure qui précède le départ. */
export const REQUEST_CLOSE_BEFORE_MIN = 60;
/** Délai laissé à l'opérateur pour reconfirmer une proposition choisie. */
export const CONFIRM_WINDOW_MIN = 120;
export const OFFER_DEFAULT_VALID_HOURS = 24;
export const MAX_OPEN_REQUESTS = 10;
export const REQUESTS_MAX_PER_HOUR = 20;
/** Opérateurs prévenus d'une nouvelle demande (les plus proches d'abord). */
export const NOTIFY_MAX = 30;

const OPEN = ['published', 'offers_received'];
const PAGE_SIZE = 25;
const MIN = 60_000;

// Coordonnées interdites avant confirmation : téléphone (9 chiffres et plus,
// séparateurs compris), e-mail, applications de messagerie.
const PHONE = /(\+?\d[\s.\-()]?){9,}/;
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const APPS = /\b(whats ?app|telegram|signal|snap(chat)?|insta(gram)?|messenger)\b/i;

/** Adresse sans numéro ni rue (« 75017 Paris ») tant que rien n'est confirmé. */
export function coarseAddress(address: string): string {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 ? parts.slice(1).join(', ') : address;
}
const coarse = (x: number) => Math.round(x * 100) / 100; // ≈ 1 km

/** Durée estimée (vol d'oiseau × 1,3 à 70 km/h) pour les contrôles de créneau. */
const estimatedMinutes = (r: Pick<TransportRequest, 'originLat' | 'originLng' | 'destinationLat' | 'destinationLng'>) =>
  Math.max(15, Math.round(((haversineKm({ lat: r.originLat, lng: r.originLng }, { lat: r.destinationLat, lng: r.destinationLng }) * 1.3) / 70) * 60));

/**
 * Bourse de transport (étape 2c). Le client publie une demande ; les
 * opérateurs compatibles la voient (sans identité ni adresse exacte) et
 * proposent un prix ; le client choisit une proposition ; l'opérateur
 * reconfirme sa disponibilité (revérifiée). Seulement alors la course XLCAB
 * est créée : un rapprochement ne vaut jamais réservation.
 */
@Injectable()
export class MarketService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private lines: LinesService,
    private matching: MatchingService,
    private notifications: NotificationsService,
    private audit: AuditService,
    private payouts: PayoutAccountsService,
  ) {}

  // ── Demandes (client) ───────────────────────────────────────────────

  async create(userId: string, dto: CreateRequestDto, now = new Date()) {
    const key = `market:request:rate:${userId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 3600);
    if (count > REQUESTS_MAX_PER_HOUR) throw new HttpException('Trop de demandes — réessayez plus tard', HttpStatus.TOO_MANY_REQUESTS);

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { deletedAt: true } });
    if (!user || user.deletedAt) throw new UnauthorizedException('Compte introuvable ou désactivé');
    const open = await this.prisma.transportRequest.count({ where: { requesterId: userId, status: { in: ['draft', ...OPEN, 'accepted'] } } });
    if (open >= MAX_OPEN_REQUESTS) throw new BadRequestException(`${MAX_OPEN_REQUESTS} demandes en cours au maximum`);

    const departureAt = new Date(dto.departureAt);
    const returnAt = dto.returnAt ? new Date(dto.returnAt) : null;
    this.checkDates(departureAt, returnAt, now);

    const request = await this.prisma.transportRequest.create({
      data: {
        requesterId: userId,
        partnerRef: dto.partnerRef || null,
        originAddress: dto.originAddress,
        originLat: dto.originLat,
        originLng: dto.originLng,
        destinationAddress: dto.destinationAddress,
        destinationLat: dto.destinationLat,
        destinationLng: dto.destinationLng,
        departureAt,
        flexMin: dto.flexMin ?? 0,
        returnAt,
        passengers: dto.passengers,
        luggage: dto.luggage ?? 0,
        accessible: dto.accessible ?? false,
        recurring: dto.recurring ?? false,
        frequency: dto.frequency || null,
        budgetCents: dto.budgetCents ?? null,
        needs: dto.needs || null,
        comment: dto.comment || null,
        status: 'draft',
        expiresAt: new Date(departureAt.getTime() - REQUEST_CLOSE_BEFORE_MIN * MIN),
      },
    });
    await this.audit.log({ userId, action: 'market.request.create', entity: 'TransportRequest', entityId: request.id });
    return dto.publish ? this.publish(userId, request.id, now) : this.requestView(request);
  }

  async publish(userId: string, requestId: string, now = new Date()) {
    this.assertMarketOpen();
    const request = await this.ownRequest(userId, requestId);
    if (request.status !== 'draft') throw new ConflictException('Demande déjà publiée');
    this.checkDates(request.departureAt, request.returnAt, now);
    const updated = await this.prisma.transportRequest.update({ where: { id: requestId }, data: { status: 'published', publishedAt: now } });

    // Opérateurs compatibles prévenus, du plus proche (départ de leurs lignes) au plus loin.
    const operators = await this.compatibleOperators(updated);
    for (const o of operators.slice(0, NOTIFY_MAX)) {
      await this.notifications.notify(o, 'market.request.new', 'Nouvelle demande de transport',
        `${updated.passengers} passagers, ${coarseAddress(updated.originAddress)} → ${coarseAddress(updated.destinationAddress)}.`, { requestId });
    }
    await this.audit.log({ userId, action: 'market.request.publish', entity: 'TransportRequest', entityId: requestId, metadata: { notified: Math.min(operators.length, NOTIFY_MAX) } });
    return { ...(await this.requestView(updated)), notifiedOperators: Math.min(operators.length, NOTIFY_MAX) };
  }

  async myRequests(userId: string, q: MarketQueryDto) {
    const rows = await this.prisma.transportRequest.findMany({
      where: { requesterId: userId, status: q.status },
      orderBy: { departureAt: 'desc' },
      skip: ((q.page ?? 1) - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    return Promise.all(rows.map((r) => this.requestView(r)));
  }

  async getRequest(userId: string, requestId: string) {
    return this.requestView(await this.ownRequest(userId, requestId));
  }

  async cancelRequest(userId: string, requestId: string) {
    const request = await this.ownRequest(userId, requestId);
    if (!['draft', ...OPEN, 'accepted'].includes(request.status)) {
      throw new ConflictException(request.status === 'confirmed'
        ? 'Réservation confirmée : annulez la course depuis son suivi'
        : 'Cette demande ne peut plus être annulée');
    }
    await this.prisma.transportRequest.update({ where: { id: requestId }, data: { status: 'cancelled' } });
    const offers = await this.prisma.transportOffer.findMany({ where: { requestId, status: { in: ['pending', 'accepted'] } } });
    await this.prisma.transportOffer.updateMany({ where: { requestId, status: { in: ['pending', 'accepted'] } }, data: { status: 'rejected' } });
    for (const o of offers) {
      await this.notifications.notify(o.operatorId, 'market.request.cancelled', 'Demande annulée', 'Le client a annulé sa demande de transport.', { requestId });
    }
    await this.audit.log({ userId, action: 'market.request.cancel', entity: 'TransportRequest', entityId: requestId });
    return { id: requestId, status: 'cancelled' };
  }

  /** Propositions reçues, comparables (prix, horaire, véhicule, opérateur vérifié). */
  async offersFor(userId: string, requestId: string) {
    await this.ownRequest(userId, requestId);
    const offers = await this.prisma.transportOffer.findMany({ where: { requestId, status: { not: 'withdrawn' } }, orderBy: { priceCents: 'asc' } });
    return Promise.all(offers.map((o) => this.offerView(o)));
  }

  /** Départs de lignes régulières qui répondent déjà à la demande (réservables tout de suite). */
  async lineMatches(userId: string, requestId: string) {
    const r = await this.ownRequest(userId, requestId);
    return this.lines.search({
      fromLat: r.originLat, fromLng: r.originLng, toLat: r.destinationLat, toLng: r.destinationLng,
      date: localDateOf(r.departureAt, 'Europe/Paris'),
      time: localTimeOf(r.departureAt, 'Europe/Paris'),
      flexMin: Math.max(r.flexMin, 60),
      seats: r.passengers,
      luggage: r.luggage,
    });
  }

  /** Le client choisit une proposition : l'opérateur doit la reconfirmer. */
  async acceptOffer(userId: string, offerId: string, now = new Date()) {
    const offer = await this.prisma.transportOffer.findUnique({ where: { id: offerId } });
    const request = offer && (await this.prisma.transportRequest.findUnique({ where: { id: offer.requestId } }));
    if (!offer || !request || request.requesterId !== userId) throw new NotFoundException('Proposition introuvable');
    if (offer.status !== 'pending' || offer.validUntil <= now) throw new ConflictException('Proposition expirée ou déjà traitée');
    if (!OPEN.includes(request.status) || request.acceptedOfferId) throw new ConflictException('Une proposition est déjà en cours de confirmation');

    const deadline = new Date(Math.min(now.getTime() + CONFIRM_WINDOW_MIN * MIN, request.expiresAt.getTime()));
    const claimed = await this.prisma.transportRequest.updateMany({
      where: { id: request.id, status: { in: OPEN }, acceptedOfferId: null },
      data: { status: 'accepted', acceptedOfferId: offer.id },
    });
    if (claimed.count === 0) throw new ConflictException('Une proposition est déjà en cours de confirmation');
    await this.prisma.transportOffer.update({ where: { id: offer.id }, data: { status: 'accepted', confirmDeadline: deadline, respondedAt: now } });
    await this.notifications.notify(offer.operatorId, 'market.offer.accepted', 'Proposition retenue',
      'Le client a choisi votre proposition : confirmez votre disponibilité pour valider la réservation.', { offerId: offer.id });
    await this.audit.log({ userId, action: 'market.offer.accept', entity: 'TransportOffer', entityId: offer.id });
    return { offerId: offer.id, status: 'accepted', confirmDeadline: deadline };
  }

  // ── Côté opérateur ──────────────────────────────────────────────────

  /** Demandes ouvertes que ce chauffeur peut assurer (sans identité ni adresse exacte du client). */
  async feed(operatorId: string, now = new Date()) {
    const vehicles = await this.eligibleVehiclesOf(operatorId);
    if (vehicles.length === 0) return [];
    const requests = await this.prisma.transportRequest.findMany({
      where: { status: { in: OPEN }, expiresAt: { gt: now } },
      orderBy: { departureAt: 'asc' },
      take: 200,
    });
    const mine = await this.prisma.transportOffer.findMany({ where: { operatorId, requestId: { in: requests.map((r) => r.id) } } });
    return requests
      .filter((r) => r.requesterId !== operatorId && vehicles.some((v) => this.fits(v, r)))
      .map((r) => {
        const offer = mine.find((o) => o.requestId === r.id);
        return {
          id: r.id,
          origin: { area: coarseAddress(r.originAddress), lat: coarse(r.originLat), lng: coarse(r.originLng) },
          destination: { area: coarseAddress(r.destinationAddress), lat: coarse(r.destinationLat), lng: coarse(r.destinationLng) },
          distanceKm: Math.round(haversineKm({ lat: r.originLat, lng: r.originLng }, { lat: r.destinationLat, lng: r.destinationLng })),
          departureAt: r.departureAt,
          flexMin: r.flexMin,
          returnAt: r.returnAt,
          passengers: r.passengers,
          luggage: r.luggage,
          accessible: r.accessible,
          recurring: r.recurring,
          frequency: r.frequency,
          budgetCents: r.budgetCents,
          needs: r.needs,
          expiresAt: r.expiresAt,
          myOffer: offer ? { id: offer.id, priceCents: offer.priceCents, status: offer.status } : null,
        };
      });
  }

  async propose(operatorId: string, requestId: string, dto: CreateOfferDto, now = new Date()) {
    this.assertMarketOpen();
    const request = await this.prisma.transportRequest.findUnique({ where: { id: requestId } });
    if (!request || !OPEN.includes(request.status) || request.expiresAt <= now || request.requesterId === operatorId) {
      throw new NotFoundException('Demande introuvable ou close');
    }
    await this.assertOperator(operatorId);
    // Paiement en ligne activé : pas de proposition sans compte de versement validé.
    await this.payouts.assertReady(operatorId);
    const vehicle = (await this.eligibleVehiclesOf(operatorId)).find((v) => v.id === dto.vehicleId);
    if (!vehicle) throw new NotFoundException('Véhicule introuvable');
    if (!this.fits(vehicle, request)) throw new BadRequestException('Ce véhicule ne convient pas à cette demande (places, accessibilité ou documents)');
    if (dto.includesReturn && !request.returnAt) throw new BadRequestException('Cette demande ne prévoit pas de retour');

    const pickupAt = dto.pickupAt ? new Date(dto.pickupAt) : request.departureAt;
    const gapMin = Math.abs(pickupAt.getTime() - request.departureAt.getTime()) / MIN;
    if (gapMin > Math.max(request.flexMin, 15)) throw new BadRequestException('Horaire proposé hors de la souplesse demandée par le client');
    const validUntil = new Date(Math.min(now.getTime() + (dto.validHours ?? OFFER_DEFAULT_VALID_HOURS) * 3600_000, request.expiresAt.getTime()));

    const existing = await this.prisma.transportOffer.findUnique({ where: { requestId_operatorId: { requestId, operatorId } } });
    if (existing && !['withdrawn', 'expired', 'declined'].includes(existing.status)) {
      throw new ConflictException('Vous avez déjà fait une proposition : retirez-la pour en faire une nouvelle');
    }
    const data = {
      vehicleId: vehicle.id, priceCents: dto.priceCents, pickupAt, includesReturn: dto.includesReturn ?? false,
      conditions: dto.conditions || null, status: 'pending', validUntil, confirmDeadline: null, respondedAt: null,
    };
    const offer = existing
      ? await this.prisma.transportOffer.update({ where: { id: existing.id }, data })
      : await this.prisma.transportOffer.create({ data: { requestId, operatorId, ...data } });
    if (request.status === 'published') {
      await this.prisma.transportRequest.updateMany({ where: { id: requestId, status: 'published' }, data: { status: 'offers_received' } });
    }
    await this.notifications.notify(request.requesterId, 'market.offer.new', 'Nouvelle proposition',
      'Un opérateur vérifié a répondu à votre demande de transport.', { requestId });
    await this.audit.log({ userId: operatorId, action: 'market.offer.create', entity: 'TransportOffer', entityId: offer.id, metadata: { priceCents: dto.priceCents } });
    return this.offerView(offer);
  }

  async withdraw(operatorId: string, offerId: string) {
    const offer = await this.ownOffer(operatorId, offerId);
    if (offer.status !== 'pending') throw new ConflictException('Seule une proposition en attente peut être retirée');
    await this.prisma.transportOffer.update({ where: { id: offerId }, data: { status: 'withdrawn' } });
    await this.refreshStatus(offer.requestId);
    return { id: offerId, status: 'withdrawn' };
  }

  async myOffers(operatorId: string) {
    const offers = await this.prisma.transportOffer.findMany({ where: { operatorId }, orderBy: { createdAt: 'desc' }, take: 100 });
    return Promise.all(offers.map((o) => this.offerView(o)));
  }

  /**
   * L'opérateur reconfirme : disponibilité et véhicule revérifiés, puis
   * création de la course (et du retour), réservation confirmée.
   */
  async confirm(operatorId: string, offerId: string, now = new Date()) {
    this.assertMarketOpen();
    const offer = await this.ownOffer(operatorId, offerId);
    if (offer.status !== 'accepted' || !offer.confirmDeadline || offer.confirmDeadline <= now) {
      throw new ConflictException('Proposition expirée ou déjà traitée');
    }
    const request = await this.prisma.transportRequest.findUnique({ where: { id: offer.requestId } });
    if (!request || request.status !== 'accepted' || request.acceptedOfferId !== offer.id) throw new ConflictException('Proposition expirée ou déjà traitée');
    await this.assertOperator(operatorId);
    await this.payouts.assertReady(operatorId);
    const vehicle = (await this.eligibleVehiclesOf(operatorId)).find((v) => v.id === offer.vehicleId);
    if (!vehicle || !this.fits(vehicle, request)) throw new ConflictException('Véhicule plus disponible pour cette demande');
    const duration = estimatedMinutes(request);
    if ((await this.matching.busyDrivers([operatorId], offer.pickupAt, duration)).has(operatorId)) {
      throw new ConflictException('Vous avez déjà une course sur ce créneau');
    }

    const legs = offer.includesReturn && request.returnAt ? 2 : 1;
    const shares = [Math.ceil(offer.priceCents / legs), Math.floor(offer.priceCents / legs)].slice(0, legs);
    const config = await this.prisma.jurisdictionConfig.findUnique({ where: { code: vehicle.jurisdiction } });
    const rate = Number(config?.vatPassengerRate ?? 0);
    const tripIds: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (let leg = 0; leg < legs; leg++) {
        const back = leg === 1;
        const total = shares[leg];
        const base = Math.round(total / (1 + rate / 100));
        const trip = await tx.trip.create({
          data: {
            type: 'passenger',
            status: TripStatus.ACCEPTED,
            source: 'market',
            passengerId: request.requesterId,
            driverId: operatorId,
            vehicleId: vehicle.id,
            acceptedAt: now,
            shuttleType: vehicle.shuttleType,
            originAddress: back ? request.destinationAddress : request.originAddress,
            originLat: back ? request.destinationLat : request.originLat,
            originLng: back ? request.destinationLng : request.originLng,
            destinationAddress: back ? request.originAddress : request.destinationAddress,
            destinationLat: back ? request.originLat : request.destinationLat,
            destinationLng: back ? request.originLng : request.destinationLng,
            durationMin: duration,
            scheduledAt: back ? request.returnAt! : offer.pickupAt,
            totalPriceCents: total,
            vatCents: total - base,
            commissionCents: Math.round((base * driverCommissionPercent()) / 100),
            jurisdiction: vehicle.jurisdiction,
            priceLines: { create: [{ regime: 'passenger', baseCents: base, ratePercent: rate, vatCents: total - base }] },
          },
          select: { id: true },
        });
        await tx.passengerBooking.create({
          data: { tripId: trip.id, seats: request.passengers, extraLuggage: request.luggage > request.passengers, qrCode: randomUUID(), notes: request.needs },
        });
        tripIds.push(trip.id);
      }
    });

    await this.prisma.transportOffer.update({ where: { id: offer.id }, data: { status: 'confirmed', respondedAt: now } });
    await this.prisma.transportOffer.updateMany({ where: { requestId: request.id, status: 'pending' }, data: { status: 'rejected' } });
    await this.prisma.transportRequest.update({
      where: { id: request.id },
      data: { status: 'confirmed', tripId: tripIds[0], returnTripId: tripIds[1] ?? null },
    });
    await this.notifications.notify(request.requesterId, 'market.confirmed', 'Réservation confirmée',
      'L’opérateur a confirmé sa disponibilité : votre trajet est réservé.', { tripId: tripIds[0] });
    await this.notifications.notify(operatorId, 'market.confirmed.driver', 'Course ajoutée', 'La course est dans vos missions.', { tripId: tripIds[0] });
    await this.audit.log({ userId: operatorId, action: 'market.offer.confirm', entity: 'TransportOffer', entityId: offer.id, metadata: { tripIds } });
    return { offerId: offer.id, status: 'confirmed', tripId: tripIds[0], returnTripId: tripIds[1] ?? null };
  }

  /** L'opérateur ne peut finalement pas : le client choisit une autre proposition. */
  async decline(operatorId: string, offerId: string, now = new Date()) {
    const offer = await this.ownOffer(operatorId, offerId);
    if (offer.status !== 'accepted') throw new ConflictException('Proposition expirée ou déjà traitée');
    await this.prisma.transportOffer.update({ where: { id: offerId }, data: { status: 'declined', respondedAt: now } });
    await this.releaseAcceptance(offer, 'L’opérateur n’a pas pu confirmer : choisissez une autre proposition.');
    await this.audit.log({ userId: operatorId, action: 'market.offer.decline', entity: 'TransportOffer', entityId: offerId });
    return { id: offerId, status: 'declined' };
  }

  // ── Messagerie avant confirmation ───────────────────────────────────

  async messages(userId: string, offerId: string) {
    await this.offerParty(userId, offerId);
    const rows = await this.prisma.offerMessage.findMany({ where: { offerId }, orderBy: { createdAt: 'asc' } });
    return rows.map((m) => ({ id: m.id, mine: m.authorId === userId, body: m.body, createdAt: m.createdAt }));
  }

  async postMessage(userId: string, offerId: string, body: string) {
    const { offer, request } = await this.offerParty(userId, offerId);
    if (!['pending', 'accepted', 'confirmed'].includes(offer.status)) throw new ConflictException('Échange clos pour cette proposition');
    if (offer.status !== 'confirmed' && (PHONE.test(body) || EMAIL.test(body) || APPS.test(body))) {
      throw new BadRequestException('Pas de coordonnées avant la confirmation : échangez par la messagerie XLCAB');
    }
    const message = await this.prisma.offerMessage.create({ data: { offerId, authorId: userId, body } });
    const to = userId === offer.operatorId ? request.requesterId : offer.operatorId;
    await this.notifications.notify(to, 'market.message', 'Nouveau message', 'Vous avez reçu un message à propos d’une demande de transport.', { offerId });
    return { id: message.id, mine: true, body, createdAt: message.createdAt };
  }

  // ── Planificateur ───────────────────────────────────────────────────

  async tick(now = new Date()) {
    let expired = 0;
    // Propositions périmées.
    const stale = await this.prisma.transportOffer.findMany({ where: { status: 'pending', validUntil: { lte: now } } });
    if (stale.length > 0) {
      await this.prisma.transportOffer.updateMany({ where: { id: { in: stale.map((o) => o.id) } }, data: { status: 'expired' } });
      for (const requestId of new Set(stale.map((o) => o.requestId))) await this.refreshStatus(requestId);
    }
    // Choix du client non reconfirmé à temps par l'opérateur.
    const unconfirmed = await this.prisma.transportOffer.findMany({ where: { status: 'accepted', confirmDeadline: { lte: now } } });
    for (const o of unconfirmed) {
      await this.prisma.transportOffer.update({ where: { id: o.id }, data: { status: 'expired' } });
      await this.releaseAcceptance(o, 'L’opérateur n’a pas confirmé à temps : choisissez une autre proposition.');
    }
    // Demandes arrivées à échéance sans réservation confirmée.
    const due = await this.prisma.transportRequest.findMany({ where: { status: { in: [...OPEN, 'accepted', 'draft'] }, expiresAt: { lte: now } } });
    for (const r of due) {
      await this.prisma.transportRequest.update({ where: { id: r.id }, data: { status: 'expired' } });
      await this.prisma.transportOffer.updateMany({ where: { requestId: r.id, status: { in: ['pending', 'accepted'] } }, data: { status: 'expired' } });
      if (r.status !== 'draft') {
        await this.notifications.notify(r.requesterId, 'market.request.expired', 'Demande expirée',
          'Aucune réservation n’a pu être confirmée à temps pour votre demande.', { requestId: r.id });
      }
      expired++;
    }
    return { expiredOffers: stale.length + unconfirmed.length, expiredRequests: expired };
  }

  // ── Équipe XLCAB ────────────────────────────────────────────────────

  async adminList(q: MarketQueryDto, now = new Date()) {
    const where = { status: q.status };
    const [rows, total] = await Promise.all([
      this.prisma.transportRequest.findMany({ where, orderBy: { departureAt: 'asc' }, skip: ((q.page ?? 1) - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      this.prisma.transportRequest.count({ where }),
    ]);
    const offers = await this.prisma.transportOffer.findMany({ where: { requestId: { in: rows.map((r) => r.id) } }, select: { requestId: true, status: true } });
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.requesterId) } }, select: { id: true, email: true } });
    return {
      items: rows.map((r) => {
        const mine = offers.filter((o) => o.requestId === r.id);
        return {
          ...r,
          requesterEmail: users.find((u) => u.id === r.requesterId)?.email ?? null,
          offers: mine.length,
          // À surveiller : ouverte depuis plus de 12 h sans proposition, ou départ dans moins de 24 h sans confirmation.
          needsAttention:
            OPEN.includes(r.status) &&
            ((mine.length === 0 && r.publishedAt !== null && now.getTime() - r.publishedAt.getTime() > 12 * 3600_000) ||
              r.departureAt.getTime() - now.getTime() < 24 * 3600_000),
        };
      }),
      total,
      page: q.page ?? 1,
      pageSize: PAGE_SIZE,
    };
  }

  // ── Utilitaires ─────────────────────────────────────────────────────

  /** Pas de vente réelle en production tant que Stripe Connect n'est pas branché (comme les lignes). */
  private assertMarketOpen() {
    if (linePaymentMode() !== 'deferred' || process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException('Bourse de transport bientôt disponible');
    }
  }

  private checkDates(departureAt: Date, returnAt: Date | null, now: Date) {
    if (departureAt.getTime() - now.getTime() < REQUEST_MIN_LEAD_MIN * MIN) {
      throw new BadRequestException('Départ trop proche : au moins 2 heures à l’avance');
    }
    if (departureAt.getTime() - now.getTime() > 365 * 24 * 3600_000) throw new BadRequestException('Départ trop lointain (un an au plus)');
    if (returnAt && returnAt <= departureAt) throw new BadRequestException('Le retour doit partir après l’aller');
  }

  private async assertOperator(operatorId: string) {
    const [operator, driver] = await Promise.all([
      this.prisma.operatorProfile.findUnique({ where: { id: operatorId } }),
      this.prisma.driverProfile.findUnique({ where: { id: operatorId } }),
    ]);
    if (operator?.status !== 'verified' || !driver?.approvedAt) {
      throw new ConflictException('Profil opérateur non vérifié : la bourse vous sera ouverte après validation par XLCAB');
    }
  }

  /** Véhicules de l'opérateur (vérifié) ; vides sinon. */
  private async eligibleVehiclesOf(operatorId: string) {
    const [operator, driver] = await Promise.all([
      this.prisma.operatorProfile.findUnique({ where: { id: operatorId } }),
      this.prisma.driverProfile.findUnique({ where: { id: operatorId } }),
    ]);
    if (operator?.status !== 'verified' || !driver?.approvedAt) return [];
    return this.prisma.vehicle.findMany({ where: { driverId: operatorId }, orderBy: { capacity: 'asc' } });
  }

  private fits(
    v: { capacity: number; pmrEquipped: boolean; insuranceExpiry: Date | null; technicalControlExpiry: Date | null },
    r: Pick<TransportRequest, 'passengers' | 'accessible' | 'departureAt' | 'returnAt'>,
  ) {
    const until = r.returnAt ?? r.departureAt;
    const valid = (d: Date | null) => !d || new Date(d) > until;
    return v.capacity >= r.passengers && (!r.accessible || v.pmrEquipped) && valid(v.insuranceExpiry) && valid(v.technicalControlExpiry);
  }

  /** Opérateurs vérifiés ayant un véhicule adapté, les plus proches (lignes au départ de la zone) d'abord. */
  private async compatibleOperators(r: TransportRequest): Promise<string[]> {
    const operators = await this.prisma.operatorProfile.findMany({ where: { status: 'verified' }, select: { id: true } });
    const ids = operators.map((o) => o.id).filter((id) => id !== r.requesterId);
    const [drivers, vehicles, lines] = await Promise.all([
      this.prisma.driverProfile.findMany({ where: { id: { in: ids }, approvedAt: { not: null } }, select: { id: true } }),
      this.prisma.vehicle.findMany({ where: { driverId: { in: ids } } }),
      this.prisma.recurringLine.findMany({ where: { operatorId: { in: ids }, status: 'active' } }),
    ]);
    const approved = new Set(drivers.map((d) => d.id));
    const near = (id: string) => {
      const own = lines.filter((l) => l.operatorId === id);
      const km = own.map((l) => haversineKm({ lat: r.originLat, lng: r.originLng }, { lat: l.originLat, lng: l.originLng }));
      return km.length ? Math.min(...km) : Number.POSITIVE_INFINITY;
    };
    return ids
      .filter((id) => approved.has(id) && vehicles.some((v) => v.driverId === id && this.fits(v, r)))
      .sort((a, b) => near(a) - near(b));
  }

  /** Statut de la demande selon les propositions encore en attente. */
  private async refreshStatus(requestId: string) {
    const request = await this.prisma.transportRequest.findUnique({ where: { id: requestId } });
    if (!request || !OPEN.includes(request.status)) return;
    const pending = await this.prisma.transportOffer.count({ where: { requestId, status: 'pending' } });
    const status = pending > 0 ? 'offers_received' : 'published';
    if (status !== request.status) await this.prisma.transportRequest.update({ where: { id: requestId }, data: { status } });
  }

  /** Le choix du client tombe (refus ou délai dépassé) : la demande se rouvre. */
  private async releaseAcceptance(offer: TransportOffer, message: string) {
    const reopened = await this.prisma.transportRequest.updateMany({
      where: { id: offer.requestId, status: 'accepted', acceptedOfferId: offer.id },
      data: { status: 'offers_received', acceptedOfferId: null },
    });
    if (reopened.count === 0) return;
    await this.refreshStatus(offer.requestId);
    const request = await this.prisma.transportRequest.findUnique({ where: { id: offer.requestId } });
    if (request) await this.notifications.notify(request.requesterId, 'market.offer.unconfirmed', 'Proposition non confirmée', message, { requestId: request.id });
  }

  private async ownRequest(userId: string, requestId: string) {
    const request = await this.prisma.transportRequest.findUnique({ where: { id: requestId } });
    if (!request || request.requesterId !== userId) throw new NotFoundException('Demande introuvable');
    return request;
  }

  private async ownOffer(operatorId: string, offerId: string) {
    const offer = await this.prisma.transportOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.operatorId !== operatorId) throw new NotFoundException('Proposition introuvable');
    return offer;
  }

  /** Seuls le client de la demande et l'opérateur de la proposition échangent. */
  private async offerParty(userId: string, offerId: string) {
    const offer = await this.prisma.transportOffer.findUnique({ where: { id: offerId } });
    const request = offer && (await this.prisma.transportRequest.findUnique({ where: { id: offer.requestId } }));
    if (!offer || !request || (userId !== offer.operatorId && userId !== request.requesterId)) {
      throw new NotFoundException('Proposition introuvable');
    }
    return { offer, request };
  }

  private async requestView(r: TransportRequest) {
    // En cours / terminée / annulée après confirmation : lu sur la course.
    const trip = r.tripId ? await this.prisma.trip.findUnique({ where: { id: r.tripId }, select: { status: true } }) : null;
    const progress =
      trip?.status === TripStatus.STARTED ? 'in_progress' : trip?.status === TripStatus.COMPLETED ? 'completed' : trip?.status === TripStatus.CANCELLED ? 'cancelled' : null;
    const offers = await this.prisma.transportOffer.count({ where: { requestId: r.id, status: { in: ['pending', 'accepted'] } } });
    return {
      id: r.id,
      status: progress ?? r.status,
      origin: { address: r.originAddress, lat: r.originLat, lng: r.originLng },
      destination: { address: r.destinationAddress, lat: r.destinationLat, lng: r.destinationLng },
      departureAt: r.departureAt,
      flexMin: r.flexMin,
      returnAt: r.returnAt,
      passengers: r.passengers,
      luggage: r.luggage,
      accessible: r.accessible,
      recurring: r.recurring,
      frequency: r.frequency,
      budgetCents: r.budgetCents,
      needs: r.needs,
      comment: r.comment,
      partnerRef: r.partnerRef,
      expiresAt: r.expiresAt,
      openOffers: offers,
      tripId: r.tripId,
      returnTripId: r.returnTripId,
    };
  }

  private async offerView(o: TransportOffer) {
    const [operator, driver, user, vehicle, request] = await Promise.all([
      this.prisma.operatorProfile.findUnique({ where: { id: o.operatorId } }),
      this.prisma.driverProfile.findUnique({ where: { id: o.operatorId } }),
      this.prisma.user.findUnique({ where: { id: o.operatorId }, select: { firstName: true } }),
      this.prisma.vehicle.findUnique({ where: { id: o.vehicleId } }),
      this.prisma.transportRequest.findUnique({ where: { id: o.requestId } }),
    ]);
    return {
      id: o.id,
      requestId: o.requestId,
      // Rappel de la demande (zones approximatives : l'adresse exacte vient avec la course confirmée).
      request: request && {
        originArea: coarseAddress(request.originAddress),
        destinationArea: coarseAddress(request.destinationAddress),
        passengers: request.passengers,
      },
      priceCents: o.priceCents,
      pickupAt: o.pickupAt,
      includesReturn: o.includesReturn,
      conditions: o.conditions,
      status: o.status,
      validUntil: o.validUntil,
      confirmDeadline: o.confirmDeadline,
      // Profil public de l'opérateur : jamais de téléphone, d'e-mail ni de plaque.
      operator: {
        name: operator?.legalName ?? user?.firstName ?? null,
        kind: operator?.kind ?? null,
        verified: operator?.status === 'verified',
        rating: driver && driver.ratingCount > 0 ? Number(driver.rating) : null,
        ratingCount: driver?.ratingCount ?? 0,
        languages: driver?.languages ?? [],
      },
      vehicle: vehicle ? { brand: vehicle.brand, model: vehicle.model, capacity: vehicle.capacity, accessible: vehicle.pmrEquipped } : null,
    };
  }
}
