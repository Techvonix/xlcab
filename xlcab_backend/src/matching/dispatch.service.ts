import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { Candidate, MatchingService } from './matching.service';
import {
  MATCHABLE_STATUSES,
  NO_DRIVER_RETRY_SECONDS,
  ShuttleType,
  TripStatus,
  dispatchLeadMin,
  dispatchRetryKey,
  dispatchStartAt,
  withinTrackingLead,
  dispatchQueueKey,
  driverOfferKey,
  driverSeenKey,
  driverTripKey,
} from './matching.constants';

// Partie 7 (écran 15) : "Accept/Refuse timer 30s (auto-refus après)".
export const OFFER_TIMEOUT_MS = 30_000;
// La clé Redis de l'offre survit un peu au timer : c'est le timer qui
// décide de l'expiration, la TTL n'est qu'un filet de sécurité.
const OFFER_KEY_TTL_SECONDS = 35;
const QUEUE_TTL_SECONDS = 10 * 60;

/** Filet de sécurité si une course n'est jamais clôturée (12 h). */
export const DRIVER_TRIP_TTL_SECONDS = 12 * 3600;

// Supprime une clé seulement si elle contient encore la valeur attendue,
// de façon atomique. Sert d'arbitre entre acceptation, refus et
// expiration arrivant au même instant : un seul des trois "gagne".
const COMPARE_AND_DELETE = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0`;

const vehicleKey = (tripId: string) => `dispatch:${tripId}:vehicle`;
const offerPayloadKey = (tripId: string) => `dispatch:${tripId}:offer`;

export interface RequestUser {
  sub: string;
  role: string;
}

/** Identité des actions automatiques (paiement reçu, planificateur, désistement). */
export const SYSTEM_USER: RequestUser = { sub: 'system', role: 'admin' };

const LATE_DISPATCH_GRACE_MS = 15 * 60_000;
const SCHEDULER_BATCH = 50;

/**
 * Dispatch séquentiel : la course est proposée à un chauffeur à la fois,
 * du plus proche au plus loin. Sans réponse sous 30 s, ou en cas de
 * refus, elle passe au suivant. Sans preneur, statut "no_driver".
 *
 * Limite connue : les timers de 30 s vivent dans ce processus. Si
 * l'API redémarre pendant une recherche, celle-ci s'arrête (la course
 * reste en "searching"). Suffisant pour une seule instance (Lightsail,
 * Partie 2.4) ; à remplacer par une file de jobs différés avant de
 * passer à plusieurs instances.
 */
@Injectable()
export class DispatchService implements OnModuleDestroy {
  private readonly logger = new Logger(DispatchService.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private matching: MatchingService,
    private tracking: TrackingGateway,
  ) {}

  onModuleDestroy() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }

  // ── POST /trips/match ───────────────────────────────────────────────

  async startMatching(user: RequestUser, tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        passengerId: true,
        status: true,
        shuttleType: true,
        jurisdiction: true,
        originLat: true,
        originLng: true,
        destinationLat: true,
        destinationLng: true,
        scheduledAt: true,
        durationMin: true,
        passengerBooking: { select: { seats: true } },
      },
    });
    // Ownership (Partie 8) : le passager de la course ou un admin.
    // Même réponse pour "inexistant" et "pas à vous".
    if (!trip || (trip.passengerId !== user.sub && user.role !== 'admin')) {
      throw new NotFoundException('Trajet introuvable');
    }
    if (!MATCHABLE_STATUSES.includes(trip.status)) {
      throw new ConflictException('Une recherche est déjà en cours ou la course est attribuée');
    }

    // Course lointaine : solliciter maintenant les chauffeurs en ligne près
    // du départ n'a pas de sens (ils ne seront plus là dans 5 jours). La
    // course reste "pending" ; le planificateur lancera la recherche à
    // T − 3 h (dispatchDue).
    const startAt = dispatchStartAt(trip.scheduledAt);
    if (startAt && startAt.getTime() > Date.now()) {
      if (trip.status !== TripStatus.PENDING) {
        await this.prisma.trip.updateMany({
          where: { id: tripId, status: { in: MATCHABLE_STATUSES } },
          data: { status: TripStatus.PENDING },
        });
        this.tracking.emitTripStatus(tripId, TripStatus.PENDING);
      }
      return { tripId, status: TripStatus.PENDING, dispatchAt: startAt };
    }

    // Prochaine relance automatique au plus tôt dans 10 min (planificateur).
    await this.redis.set(dispatchRetryKey(tripId), '1', 'EX', NO_DRIVER_RETRY_SECONDS);

    const candidates = await this.matching.findEligibleDrivers({
      preferRose: await this.prefersWomanDriver(trip.passengerId),
      lat: trip.originLat,
      lng: trip.originLng,
      shuttleType: trip.shuttleType as ShuttleType,
      jurisdiction: trip.jurisdiction,
      seats: trip.passengerBooking?.seats ?? 0,
      scheduledAt: trip.scheduledAt,
      durationMin: trip.durationMin,
      destination: { lat: trip.destinationLat, lng: trip.destinationLng },
    });

    // Passage atomique au statut "searching" : deux appels simultanés ne
    // peuvent pas lancer deux dispatchs pour la même course.
    const target = candidates.length > 0 ? TripStatus.SEARCHING : TripStatus.NO_DRIVER;
    const claimed = await this.prisma.trip.updateMany({
      where: { id: tripId, status: { in: MATCHABLE_STATUSES } },
      data: { status: target },
    });
    if (claimed.count === 0) {
      throw new ConflictException('Une recherche est déjà en cours ou la course est attribuée');
    }

    if (candidates.length === 0) {
      this.tracking.emitTripStatus(tripId, TripStatus.NO_DRIVER);
      return { tripId, status: TripStatus.NO_DRIVER };
    }

    await this.enqueue(tripId, candidates);
    const offered = await this.offerNext(tripId);
    // Ni l'identité ni la position des chauffeurs sollicités ne sont
    // renvoyées au passager.
    return {
      tripId,
      status: offered ? TripStatus.SEARCHING : TripStatus.NO_DRIVER,
    };
  }

  // ── POST /trips/:id/accept ──────────────────────────────────────────

  async accept(driverId: string, tripId: string) {
    // Seul le chauffeur à qui l'offre a été faite, et avant expiration.
    if (!(await this.releaseOffer(driverId, tripId))) {
      throw new ConflictException('Offre expirée ou inexistante');
    }

    const offer = await this.readOfferVehicle(tripId);
    if (!offer || offer.driverId !== driverId) {
      throw new ConflictException('Offre expirée ou inexistante');
    }

    // Le chauffeur a pu accepter entre-temps une autre course sur le même
    // créneau (offres reçues à quelques minutes d'intervalle) : on refuse
    // et la course passe au candidat suivant.
    const schedule = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { scheduledAt: true, durationMin: true, originLat: true, originLng: true, destinationLat: true, destinationLng: true },
    });
    const slot = schedule?.scheduledAt ?? new Date();
    const route = schedule
      ? { origin: { lat: schedule.originLat, lng: schedule.originLng }, destination: { lat: schedule.destinationLat, lng: schedule.destinationLng } }
      : undefined;
    if ((await this.matching.busyDrivers([driverId], slot, schedule?.durationMin, route)).has(driverId)) {
      await this.offerNext(tripId);
      throw new ConflictException('Vous avez déjà une course sur ce créneau');
    }

    // Garde-fou : la course a pu être annulée pendant l'offre.
    const updated = await this.prisma.trip.updateMany({
      where: { id: tripId, status: TripStatus.SEARCHING },
      data: {
        status: TripStatus.ACCEPTED,
        driverId,
        vehicleId: offer.vehicleId,
        acceptedAt: new Date(),
      },
    });
    if (updated.count === 0) {
      await this.cleanup(tripId);
      throw new ConflictException("Cette course n'est plus disponible");
    }

    // Contrat avec le Module 3 : active la diffusion des positions du
    // chauffeur aux abonnés de la course. Pour une course programmée plus
    // tard, rien n'est partagé maintenant : le suivi s'activera de
    // lui-même à T − 60 min (TrackingService.recordDriverLocation).
    // Supprimé par le module Trips à la fin ou à l'annulation.
    if (withinTrackingLead(slot)) {
      await this.redis.set(driverTripKey(driverId), tripId, 'EX', DRIVER_TRIP_TTL_SECONDS);
    }
    await this.cleanup(tripId);

    // Course qui suit le trajet retour du chauffeur : ses colis du retour
    // montent dans cette course (passagers + colis, rien ne rentre à vide).
    await this.matching.transferReturnParcels(driverId, tripId);

    this.tracking.emitTripStatus(tripId, TripStatus.ACCEPTED);
    return { tripId, status: TripStatus.ACCEPTED, vehicleId: offer.vehicleId };
  }

  // ── POST /trips/:id/refuse ──────────────────────────────────────────

  async refuse(driverId: string, tripId: string) {
    if (!(await this.releaseOffer(driverId, tripId))) {
      throw new ConflictException('Offre expirée ou inexistante');
    }
    await this.offerNext(tripId);
    return { tripId, refused: true };
  }

  // ── Mode chauffeur (écran 15) ───────────────────────────────────────

  /** Offre en cours pour ce chauffeur (reprise après mise en arrière-plan), sinon null. */
  async currentOffer(driverId: string): Promise<Record<string, unknown> | null> {
    const tripId = await this.redis.get(driverOfferKey(driverId));
    if (!tripId) return null;
    const [vehicle, raw] = await Promise.all([this.readOfferVehicle(tripId), this.redis.get(offerPayloadKey(tripId))]);
    // Double contrôle : l'offre stockée doit bien être celle de CE chauffeur.
    if (!raw || vehicle?.driverId !== driverId) return null;
    const offer = JSON.parse(raw) as { expiresAt: number };
    return offer.expiresAt > Date.now() ? offer : null;
  }

  /** Passage hors ligne : une offre en cours est refusée tout de suite (pas d'attente de 30 s). */
  async releaseOffersOf(driverId: string): Promise<void> {
    const tripId = await this.redis.get(driverOfferKey(driverId));
    if (tripId && (await this.releaseOffer(driverId, tripId))) {
      await this.offerNext(tripId);
    }
  }

  // ── Planificateur : courses programmées ─────────────────────────────

  /**
   * Appelé chaque minute par le planificateur (SchedulerService) :
   * - lance la recherche des courses "pending" entrées dans la fenêtre
   *   T − 3 h (dont les courses d'entreprise, que personne ne lançait) ;
   * - relance les courses "no_driver" toutes les 10 min jusqu'au départ.
   * Une course dont le départ est passé depuis plus de 15 min est laissée
   * telle quelle (visible dans le dashboard admin).
   */
  async dispatchDue(now = new Date()): Promise<{ started: number; retried: number }> {
    const due = await this.prisma.trip.findMany({
      where: {
        status: { in: MATCHABLE_STATUSES },
        scheduledAt: {
          gte: new Date(now.getTime() - LATE_DISPATCH_GRACE_MS),
          lte: new Date(now.getTime() + dispatchLeadMin() * 60_000),
        },
      },
      select: { id: true, status: true },
      orderBy: { scheduledAt: 'asc' },
      take: SCHEDULER_BATCH,
    });

    let started = 0;
    let retried = 0;
    for (const trip of due) {
      if (trip.status === TripStatus.NO_DRIVER) {
        // Au plus une relance toutes les 10 min (clé posée à chaque tentative).
        const free = await this.redis.set(dispatchRetryKey(trip.id), '1', 'EX', NO_DRIVER_RETRY_SECONDS, 'NX');
        if (free !== 'OK') continue;
      }
      try {
        await this.startMatching(SYSTEM_USER, trip.id);
        if (trip.status === TripStatus.NO_DRIVER) retried++;
        else started++;
      } catch (err) {
        // Course annulée ou attribuée entre la lecture et l'appel : normal.
        if (!(err instanceof ConflictException)) {
          this.logger.error(`Recherche planifiée impossible (trip ${trip.id}) : ${(err as Error).message}`);
        }
      }
    }
    return { started, retried };
  }

  // ── Mécanique interne ───────────────────────────────────────────────

  /**
   * Propose la course au prochain candidat encore disponible.
   * Retourne false si plus personne : la course passe en "no_driver".
   */
  async offerNext(tripId: string): Promise<boolean> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        status: true,
        type: true,
        shuttleType: true,
        originAddress: true,
        destinationAddress: true,
        distanceKm: true,
        scheduledAt: true,
        totalPriceCents: true,
        passengerBooking: { select: { seats: true } },
      },
    });
    // Course annulée entre-temps : on arrête sans bruit.
    if (!trip || trip.status !== TripStatus.SEARCHING) {
      await this.cleanup(tripId);
      return false;
    }

    let raw: string | null;
    while ((raw = await this.redis.lpop(dispatchQueueKey(tripId))) !== null) {
      const candidate = JSON.parse(raw) as Candidate;

      // Toujours en ligne depuis le calcul des candidats ? (La
      // disponibilité sur le créneau est revérifiée à l'acceptation.)
      const seen = await this.redis.get(driverSeenKey(candidate.driverId));
      if (seen === null) continue;

      // Un chauffeur n'a qu'une offre à la fois (verrou NX).
      const locked = await this.redis.set(
        driverOfferKey(candidate.driverId),
        tripId,
        'EX',
        OFFER_KEY_TTL_SECONDS,
        'NX',
      );
      if (locked !== 'OK') continue;

      await this.redis.set(
        vehicleKey(tripId),
        JSON.stringify({ driverId: candidate.driverId, vehicleId: candidate.vehicleId }),
        'EX',
        OFFER_KEY_TTL_SECONDS,
      );

      // Contenu de l'offre : ce qu'il faut pour décider, sans données
      // d'identité du passager (nom, téléphone) avant acceptation.
      const offer = {
        tripId,
        type: trip.type,
        shuttleType: trip.shuttleType,
        originAddress: trip.originAddress,
        destinationAddress: trip.destinationAddress,
        distanceKm: trip.distanceKm === null ? null : Number(trip.distanceKm),
        scheduledAt: trip.scheduledAt,
        seats: trip.passengerBooking?.seats ?? 0,
        totalPriceCents: trip.totalPriceCents,
        pickupDistanceKm: candidate.distanceKm,
        expiresAt: Date.now() + OFFER_TIMEOUT_MS,
      };
      // Gardée le temps de l'offre : une app revenue au premier plan (socket
      // coupée en arrière-plan) la récupère via GET /drivers/me/offer.
      await this.redis.set(offerPayloadKey(tripId), JSON.stringify(offer), 'EX', OFFER_KEY_TTL_SECONDS);
      this.tracking.emitToDriver(candidate.driverId, 'mission:offer', offer);

      this.armTimer(tripId, candidate.driverId);
      return true;
    }

    // Plus aucun candidat.
    const exhausted = await this.prisma.trip.updateMany({
      where: { id: tripId, status: TripStatus.SEARCHING },
      data: { status: TripStatus.NO_DRIVER },
    });
    await this.cleanup(tripId);
    if (exhausted.count > 0) {
      this.tracking.emitTripStatus(tripId, TripStatus.NO_DRIVER);
    }
    return false;
  }

  /** Expiration des 30 s : équivaut à un refus (auto-refus, Partie 7). */
  async onOfferTimeout(tripId: string, driverId: string): Promise<void> {
    this.timers.delete(tripId);
    if (!(await this.releaseOffer(driverId, tripId))) return; // déjà accepté/refusé
    this.tracking.emitToDriver(driverId, 'mission:expired', { tripId });
    await this.offerNext(tripId);
  }

  private armTimer(tripId: string, driverId: string) {
    this.clearTimer(tripId);
    const timer = setTimeout(() => {
      this.onOfferTimeout(tripId, driverId).catch((err: Error) =>
        this.logger.error(`Échec du passage au chauffeur suivant (trip ${tripId}) : ${err.message}`),
      );
    }, OFFER_TIMEOUT_MS);
    this.timers.set(tripId, timer);
  }

  private clearTimer(tripId: string) {
    const timer = this.timers.get(tripId);
    if (timer) clearTimeout(timer);
    this.timers.delete(tripId);
  }

  /**
   * Libère l'offre faite à ce chauffeur pour cette course. true si
   * l'appelant est le premier à la libérer (accept, refus ou timeout).
   */
  private async releaseOffer(driverId: string, tripId: string): Promise<boolean> {
    const deleted = await this.redis.eval(COMPARE_AND_DELETE, 1, driverOfferKey(driverId), tripId);
    if (deleted !== 1) return false;
    this.clearTimer(tripId);
    return true;
  }

  private async readOfferVehicle(
    tripId: string,
  ): Promise<{ driverId: string; vehicleId: string } | null> {
    const raw = await this.redis.get(vehicleKey(tripId));
    return raw ? JSON.parse(raw) : null;
  }

  private async enqueue(tripId: string, candidates: Candidate[]) {
    const key = dispatchQueueKey(tripId);
    await this.redis.del(key);
    await this.redis.rpush(key, ...candidates.map((c) => JSON.stringify(c)));
    await this.redis.expire(key, QUEUE_TTL_SECONDS);
  }

  private async cleanup(tripId: string) {
    this.clearTimer(tripId);
    await this.redis.del(dispatchQueueKey(tripId), vehicleKey(tripId), offerPayloadKey(tripId));
  }

  /** Préférence « conductrice » du passager. Une préférence ne bloque jamais une course : illisible = non. */
  private async prefersWomanDriver(passengerId: string | null): Promise<boolean> {
    if (!passengerId) return false;
    try {
      const pref = await this.prisma.userPreference.findUnique({ where: { userId: passengerId }, select: { preferWomanDriver: true } });
      return pref?.preferWomanDriver === true;
    } catch {
      return false;
    }
  }
}
