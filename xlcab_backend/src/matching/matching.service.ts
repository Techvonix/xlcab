import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  DRIVER_COMMITTED_STATUSES,
  DEFAULT_TRIP_DURATION_MIN,
  DRIVERS_GEO_KEY,
  ShuttleType,
  TripStatus,
  driverSeenKey,
  schedulesOverlap,
} from './matching.constants';
import { GRAFT_MAX_DETOUR_KM, haversineKm, returnDepartureOf } from '../parcels/parcels.constants';

// Valeurs non chiffrées dans la spec : proposées, à ajuster.
const SEARCH_RADIUS_KM = 30;
// On lit large dans l'index GEO, car beaucoup de chauffeurs proches
// seront écartés ensuite (mauvais type de navette, occupés…). Le code de
// départ prenait les 20 plus proches AVANT filtrage : il pouvait ne rien
// trouver alors que des chauffeurs éligibles existaient un peu plus loin.
const GEO_SCAN_LIMIT = 200;
/** Nombre maximum de chauffeurs sollicités tour à tour pour une course. */
export const MAX_CANDIDATES = 10;

export interface MatchCriteria {
  lat: number;
  lng: number;
  shuttleType: ShuttleType;
  jurisdiction: string;
  /** Places passagers demandées (0 pour un colis seul). */
  seats: number;
  /** Date de la course : les documents doivent encore être valides à cette date. */
  scheduledAt: Date | null;
  /** Durée estimée (devis) : sert au calcul de disponibilité sur le créneau. */
  durationMin?: number | null;
  /** Arrivée de la course : un chauffeur qui rentre par ce trajet reste sollicitable. */
  destination?: { lat: number; lng: number };
  /**
   * Préférence du passager : les conductrices habilitées Navette Rose sont
   * sollicitées en premier. Aucun chauffeur n'est écarté pour autant.
   */
  preferRose?: boolean;
}

/** Trajet d'une course candidate (départ → arrivée). */
export interface TripRoute {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
}

/** Un chauffeur éligible et le véhicule qu'il utilisera pour la course. */
export interface Candidate {
  driverId: string;
  vehicleId: string;
  distanceKm: number;
}

@Injectable()
export class MatchingService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  /**
   * Chauffeurs éligibles, du plus proche au plus loin. Ne renvoie que
   * des identifiants : ni nom ni position ne sortent de ce service (le
   * code de départ renvoyait le nom complet de chaque chauffeur proche).
   */
  async findEligibleDrivers(criteria: MatchCriteria): Promise<Candidate[]> {
    const config = await this.prisma.jurisdictionConfig.findUnique({
      where: { code: criteria.jurisdiction },
    });
    if (!config) throw new BadRequestException('Juridiction non prise en charge');

    // 1. Proximité — GEOSEARCH remplace GEORADIUS, obsolète depuis Redis 6.2.
    const nearby = await this.nearbyDrivers(criteria.lat, criteria.lng);
    if (nearby.length === 0) return [];

    // 2. Présence : position reçue il y a moins de 30 s. Écarte les
    // chauffeurs dont l'app a planté sans se déconnecter proprement.
    const ids = nearby.map((n) => n.driverId);
    const seen = await this.redis.mget(ids.map(driverSeenKey));
    const online = nearby.filter((_, i) => seen[i] !== null);
    if (online.length === 0) return [];

    // 3. Disponibilité sur le CRÉNEAU de la course : un chauffeur engagé
    // jeudi reste sollicitable aujourd'hui (courses programmées).
    const now = new Date();
    const busy = await this.busyDrivers(
      online.map((o) => o.driverId),
      criteria.scheduledAt ?? now,
      criteria.durationMin,
      criteria.destination ? { origin: { lat: criteria.lat, lng: criteria.lng }, destination: criteria.destination } : undefined,
    );
    const available = online.filter((o) => !busy.has(o.driverId));
    if (available.length === 0) return [];

    // Les documents doivent être valides aujourd'hui ET le jour de la course.
    const validAt =
      criteria.scheduledAt && criteria.scheduledAt > now ? criteria.scheduledAt : now;
    const isAccessibility = criteria.shuttleType === 'accessibility';

    // 3. Chauffeur : validé, en ligne, documents à jour (Partie 8 :
    // "Vérification périodique documents (expiration auto)").
    const drivers = await this.prisma.driverProfile.findMany({
      where: {
        id: { in: available.map((a) => a.driverId) },
        approvedAt: { not: null },
        documentsVerified: true,
        isOnline: true,
        licenseExpiry: { gt: validAt },
        ...(config.requiresVtcCard ? { vtcCardExpiry: { gt: validAt } } : {}),
        // Partie 8 : "Formation PMR obligatoire pour navette Accessibilité".
        ...(isAccessibility ? { pmrTrained: true } : {}),
        // Partie 1.3 : Navette Rose = conductrice, habilitée par un admin.
        ...(criteria.shuttleType === 'rose' ? { roseEligible: true } : {}),
      },
      select: { id: true, roseEligible: true },
    });
    if (drivers.length === 0) return [];

    // 4. Véhicule : c'est son type qui compte, pas la préférence du
    // chauffeur (le code de départ filtrait sur preferredShuttle).
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        driverId: { in: drivers.map((d) => d.id) },
        shuttleType: criteria.shuttleType,
        jurisdiction: criteria.jurisdiction,
        isAvailable: true,
        // Partie 8 : "Dashcam obligatoire".
        dashcamActive: true,
        capacity: { gte: criteria.seats },
        insuranceExpiry: { gt: validAt },
        technicalControlExpiry: { gt: validAt },
        ...(isAccessibility ? { pmrEquipped: true } : {}),
      },
      select: { id: true, driverId: true },
      // Plus petit véhicule suffisant d'abord : on garde les grands
      // véhicules pour les groupes.
      orderBy: { capacity: 'asc' },
    });

    const vehicleByDriver = new Map<string, string>();
    for (const v of vehicles) {
      if (v.driverId && !vehicleByDriver.has(v.driverId)) {
        vehicleByDriver.set(v.driverId, v.id);
      }
    }

    // 5. On conserve l'ordre de proximité de l'étape 1. Préférence « conductrice » :
    // les habilitées Navette Rose passent devant, toujours par proximité (tri stable) ;
    // les autres chauffeurs suivent, personne n'est retiré de la liste.
    const rose = new Set(drivers.filter((d) => d.roseEligible).map((d) => d.id));
    const ordered = criteria.preferRose
      ? [...available.filter((a) => rose.has(a.driverId)), ...available.filter((a) => !rose.has(a.driverId))]
      : available;
    return ordered
      .filter((a) => vehicleByDriver.has(a.driverId))
      .slice(0, MAX_CANDIDATES)
      .map((a) => ({
        driverId: a.driverId,
        vehicleId: vehicleByDriver.get(a.driverId)!,
        distanceKm: a.distanceKm,
      }));
  }

  /**
   * Chauffeurs ayant déjà une course acceptée ou en cours qui chevauche
   * le créneau demandé (marge d'1 h pour l'approche).
   */
  async busyDrivers(driverIds: string[], start: Date, durationMin?: number | null, route?: TripRoute): Promise<Set<string>> {
    if (driverIds.length === 0) return new Set();
    const day = 24 * 3600_000;
    const commitments = await this.prisma.trip.findMany({
      where: {
        driverId: { in: driverIds },
        status: { in: DRIVER_COMMITTED_STATUSES },
        scheduledAt: { gte: new Date(start.getTime() - day), lt: new Date(start.getTime() + day) },
      },
      select: { driverId: true, scheduledAt: true, durationMin: true, destinationLat: true, destinationLng: true },
    });
    const busy = new Set(
      commitments
        .filter((c) => {
          if (!c.scheduledAt) return false;
          // Course qui part de l'arrivée de celle-ci : pas de trajet
          // d'approche, donc pas de marge d'1 h — il suffit d'être arrivé.
          if (route && haversineKm(route.origin, { lat: c.destinationLat, lng: c.destinationLng }) <= GRAFT_MAX_DETOUR_KM) {
            return start.getTime() < c.scheduledAt.getTime() + (c.durationMin ?? DEFAULT_TRIP_DURATION_MIN) * 60_000;
          }
          return schedulesOverlap(c.scheduledAt, c.durationMin, start, durationMin);
        })
        .map((c) => c.driverId!),
    );
    for (const id of await this.returnLegConflicts(driverIds, start, durationMin, route)) busy.add(id);
    return busy;
  }

  /**
   * Chauffeurs qui ramènent des colis sur leur trajet retour (B → A) à ce
   * moment-là. Exception : une course qui suit ce même trajet retour reste
   * proposable — les passagers sont prioritaires, et les colis passeront
   * sur cette course à l'acceptation (transferReturnParcels).
   */
  private async returnLegConflicts(driverIds: string[], start: Date, durationMin?: number | null, route?: TripRoute): Promise<string[]> {
    const day = 24 * 3600_000;
    const outbound = await this.prisma.trip.findMany({
      where: {
        driverId: { in: driverIds },
        status: { in: [TripStatus.ACCEPTED, TripStatus.STARTED, TripStatus.COMPLETED] },
        scheduledAt: { gte: new Date(start.getTime() - 2 * day), lt: new Date(start.getTime() + day) },
      },
      select: { id: true, driverId: true, scheduledAt: true, durationMin: true, originLat: true, originLng: true, destinationLat: true, destinationLng: true },
    });
    if (outbound.length === 0) return [];
    const withParcels = await this.prisma.parcelBooking.findMany({
      where: { carrierTripId: { in: outbound.map((t) => t.id) }, onReturnLeg: true, status: { in: ['pending', 'in_transit'] } },
      select: { carrierTripId: true },
    });
    const carriers = new Set(withParcels.map((p) => p.carrierTripId));

    return outbound
      .filter((t) => carriers.has(t.id))
      .filter((t) => {
        const back = returnDepartureOf(t.scheduledAt, t.durationMin);
        if (!back || !schedulesOverlap(back, t.durationMin, start, durationMin)) return false;
        return !(route && isReverseOf(route, t));
      })
      .map((t) => t.driverId!);
  }

  /**
   * Le chauffeur accepte une course qui suit son trajet retour : les colis
   * de ce retour montent dans cette course (comme des colis greffés).
   */
  async transferReturnParcels(driverId: string, tripId: string): Promise<number> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { scheduledAt: true, durationMin: true, originLat: true, originLng: true, destinationLat: true, destinationLng: true },
    });
    if (!trip?.scheduledAt) return 0;
    const route: TripRoute = {
      origin: { lat: trip.originLat, lng: trip.originLng },
      destination: { lat: trip.destinationLat, lng: trip.destinationLng },
    };
    const outbound = await this.prisma.trip.findMany({
      where: { driverId, id: { not: tripId }, status: { in: [TripStatus.ACCEPTED, TripStatus.STARTED, TripStatus.COMPLETED] } },
      select: { id: true, scheduledAt: true, durationMin: true, originLat: true, originLng: true, destinationLat: true, destinationLng: true },
    });
    let moved = 0;
    for (const t of outbound) {
      const back = returnDepartureOf(t.scheduledAt, t.durationMin);
      if (!back || !schedulesOverlap(back, t.durationMin, trip.scheduledAt, trip.durationMin) || !isReverseOf(route, t)) continue;
      const parcels = await this.prisma.parcelBooking.findMany({
        where: { carrierTripId: t.id, onReturnLeg: true, status: 'pending' },
        select: { id: true, tripId: true },
      });
      for (const p of parcels) {
        await this.prisma.parcelBooking.update({ where: { id: p.id }, data: { carrierTripId: tripId, onReturnLeg: false } });
        await this.prisma.trip.update({ where: { id: p.tripId }, data: { scheduledAt: trip.scheduledAt } });
        moved++;
      }
    }
    return moved;
  }

  private async nearbyDrivers(
    lat: number,
    lng: number,
  ): Promise<{ driverId: string; distanceKm: number }[]> {
    const raw = (await this.redis.geosearch(
      DRIVERS_GEO_KEY,
      'FROMLONLAT',
      lng,
      lat,
      'BYRADIUS',
      SEARCH_RADIUS_KM,
      'km',
      'ASC',
      'COUNT',
      GEO_SCAN_LIMIT,
      'WITHDIST',
    )) as [string, string][];
    return raw.map(([driverId, dist]) => ({ driverId, distanceKm: Number(dist) }));
  }
}

/** La course [route] suit le trajet retour de [outbound] (départ près de son arrivée, arrivée près de son départ). */
function isReverseOf(
  route: TripRoute,
  outbound: { originLat: number; originLng: number; destinationLat: number; destinationLng: number },
): boolean {
  return (
    haversineKm(route.origin, { lat: outbound.destinationLat, lng: outbound.destinationLng }) <= GRAFT_MAX_DETOUR_KM &&
    haversineKm(route.destination, { lat: outbound.originLat, lng: outbound.originLng }) <= GRAFT_MAX_DETOUR_KM
  );
}
