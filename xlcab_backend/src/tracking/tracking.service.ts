import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

// Partie 7 (écran 15) : le chauffeur envoie sa position toutes les 3 s
// en course, 10 s sinon. On refuse tout ce qui arrive à moins d'1 s
// d'intervalle : marge pour la gigue réseau, mais pas d'inondation.
const LOCATION_MIN_INTERVAL_MS = 1000;

// Un chauffeur sans position depuis 30 s (3 envois manqués hors course)
// est considéré hors ligne. Clé à exploiter par le Matching (Module 4).
const DRIVER_SEEN_TTL_SECONDS = 30;

// Limites non chiffrées dans la spec : valeurs proposées.
const MESSAGE_MAX_PER_MINUTE = 20;
// Au-delà, les SOS répétés ne sont plus rediffusés (les premiers ont
// déjà alerté les admins) : évite de noyer la supervision.
const SOS_MAX_PER_MINUTE = 3;

// Une course terminée ou annulée n'est plus suivable (minimisation RGPD).
const TERMINAL_STATUSES = ['completed', 'cancelled'];

// Partage de la position au passager à partir de T − 60 min
// (TRACKING_LEAD_MIN du module Matching).
const TRACKING_LEAD_MS = 60 * 60_000;

// Chauffeur attribué : sa position et son téléphone peuvent être montrés.
const ACTIVE_STATUSES = ['accepted', 'started'];

/** Réponse de GET /api/v1/trips/:id/tracking (chargement + polling 10 s). */
export interface TrackingSnapshot {
  tripId: string;
  status: string;
  shuttleType: string;
  origin: { address: string; lat: number; lng: number };
  destination: { address: string; lat: number; lng: number };
  scheduledAt: Date | null;
  driver: {
    firstName: string | null;
    rating: number | null;
    /** Uniquement pour le passager, et seulement pendant la course. */
    phone: string | null;
    vehicle: {
      brand: string | null;
      model: string | null;
      color: string | null;
      plate: string;
      dashcamActive: boolean;
      pmrEquipped: boolean;
    } | null;
  } | null;
  /** Dernière position connue, uniquement pendant la course. */
  lastPosition: {
    lat: number;
    lng: number;
    heading: number | null;
    speed: number | null;
    recordedAt: Date;
  } | null;
}

/** Identité attachée à une socket après authentification. */
export interface SocketUser {
  userId: string;
  role: string;
  /** Expiration de l'access token (secondes epoch, claim "exp"). */
  tokenExp: number;
}

export interface TripAccess {
  id: string;
  passengerId: string | null;
  driverId: string | null;
  status: string;
}

export interface AccessOptions {
  /** Un admin peut suivre n'importe quelle course (supervision). */
  allowAdmin?: boolean;
  /** Autorise une course terminée/annulée (ex. SOS juste après la dépose). */
  allowTerminal?: boolean;
}

export interface LocationUpdate {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
}

export class TrackingAuthError extends Error {}

export interface SosAlert {
  tripId: string;
  userId: string;
  role: string;
  position: { lat: number; lng: number };
  timestamp: number;
}

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  // ── Authentification de la connexion ────────────────────────────────

  /**
   * Valide le token fourni au handshake Socket.io. Mêmes règles que
   * l'API REST (JwtStrategy) + relecture du compte en base, comme le
   * fait AuthService.refresh() : un compte supprimé est refusé et le
   * rôle utilisé est celui de la base, pas celui du token.
   */
  async authenticate(token: unknown): Promise<SocketUser> {
    if (typeof token !== 'string' || token.length === 0) {
      throw new TrackingAuthError('Token manquant');
    }

    let payload: JwtPayload & { exp?: number };
    try {
      // Secret explicite : un refresh token (autre secret) est rejeté.
      payload = this.jwt.verify(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new TrackingAuthError('Token invalide ou expiré');
    }
    if (!payload?.sub || !payload?.jti || !payload?.exp) {
      throw new TrackingAuthError('Token invalide ou expiré');
    }

    // Partie 8 : "Blacklist Redis pour révocation" (clé posée au logout).
    if (await this.redis.get(`blacklist:${token}`)) {
      throw new TrackingAuthError('Token révoqué');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, deletedAt: true },
    });
    if (!user || user.deletedAt) {
      throw new TrackingAuthError('Compte introuvable ou désactivé');
    }

    return { userId: user.id, role: user.role, tokenExp: payload.exp };
  }

  // ── Ownership des courses ───────────────────────────────────────────

  /**
   * Retourne la course si l'utilisateur y a droit, sinon null.
   * Même réponse pour "inexistante" et "pas à vous" : on ne révèle pas
   * l'existence d'un trajet (anti-énumération).
   *
   * NB : pour les courses colis, l'expéditeur est supposé porté par
   * Trip.passengerId. À revoir quand ParcelBooking.senderId sera en base.
   */
  async findAccessibleTrip(
    user: SocketUser,
    tripId: string,
    opts: AccessOptions = {},
  ): Promise<TripAccess | null> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, passengerId: true, driverId: true, status: true },
    });
    if (!trip) return null;

    const isParticipant =
      trip.passengerId === user.userId || trip.driverId === user.userId;
    const isAdmin = opts.allowAdmin === true && user.role === 'admin';
    if (!isParticipant && !isAdmin) return null;

    if (!opts.allowTerminal && TERMINAL_STATUSES.includes(trip.status)) {
      return null;
    }
    return trip;
  }

  /**
   * État complet d'une course pour l'écran de suivi : chargement initial
   * et mode dégradé (polling 10 s) quand le WebSocket est coupé
   * (Partie 7, écran 9). Mêmes droits que subscribe:trip ; une course
   * terminée reste lisible pour que l'app affiche "Terminé".
   */
  async getSnapshot(user: SocketUser, tripId: string): Promise<TrackingSnapshot | null> {
    const access = await this.findAccessibleTrip(user, tripId, {
      allowAdmin: true,
      allowTerminal: true,
    });
    if (!access) return null;

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        status: true,
        shuttleType: true,
        passengerId: true,
        driverId: true,
        vehicleId: true,
        originAddress: true,
        originLat: true,
        originLng: true,
        destinationAddress: true,
        destinationLat: true,
        destinationLng: true,
        scheduledAt: true,
      },
    });
    if (!trip) return null;

    const active = ACTIVE_STATUSES.includes(trip.status);
    const [driver, lastPoint] = await Promise.all([
      trip.driverId ? this.driverInfo(trip.driverId, trip.vehicleId, {
        // Téléphone : passager de la course uniquement, pendant la course.
        withPhone: active && user.userId === trip.passengerId,
      }) : null,
      active
        ? this.prisma.trackingPoint.findFirst({
            where: { tripId },
            orderBy: { recordedAt: 'desc' },
            select: { lat: true, lng: true, heading: true, speedKmh: true, recordedAt: true },
          })
        : null,
    ]);

    return {
      tripId: trip.id,
      status: trip.status,
      shuttleType: trip.shuttleType,
      origin: { address: trip.originAddress, lat: trip.originLat, lng: trip.originLng },
      destination: {
        address: trip.destinationAddress,
        lat: trip.destinationLat,
        lng: trip.destinationLng,
      },
      scheduledAt: trip.scheduledAt,
      driver,
      lastPosition: lastPoint
        ? {
            lat: lastPoint.lat,
            lng: lastPoint.lng,
            heading: lastPoint.heading,
            speed: lastPoint.speedKmh,
            recordedAt: lastPoint.recordedAt,
          }
        : null,
    };
  }

  private async driverInfo(
    driverId: string,
    vehicleId: string | null,
    opts: { withPhone: boolean },
  ): Promise<TrackingSnapshot['driver']> {
    const [user, profile, vehicle] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: driverId },
        // Prénom seulement : le nom de famille n'est pas nécessaire.
        select: { firstName: true, phone: true },
      }),
      this.prisma.driverProfile.findUnique({ where: { id: driverId }, select: { rating: true, ratingCount: true } }),
      vehicleId
        ? this.prisma.vehicle.findUnique({
            where: { id: vehicleId },
            select: {
              brand: true,
              model: true,
              color: true,
              plate: true,
              dashcamActive: true,
              pmrEquipped: true,
            },
          })
        : null,
    ]);
    return {
      firstName: user?.firstName ?? null,
      // Pas de note tant qu'aucun passager n'a noté (la valeur par défaut serait trompeuse).
      rating: profile && profile.ratingCount > 0 ? Number(profile.rating) : null,
      phone: opts.withPhone ? user?.phone ?? null : null,
      vehicle,
    };
  }

  // ── Positions chauffeur ─────────────────────────────────────────────

  /** true si la position peut être traitée, false si elle arrive trop tôt. */
  async acceptLocation(driverId: string): Promise<boolean> {
    // SET NX PX : atomique, une seule position par fenêtre d'1 s.
    const res = await this.redis.set(
      `ws:loc:throttle:${driverId}`,
      '1',
      'PX',
      LOCATION_MIN_INTERVAL_MS,
      'NX',
    );
    return res === 'OK';
  }

  /**
   * Met à jour le géo-index utilisé par le Matching et retourne la
   * course en cours du chauffeur, le cas échéant. La clé
   * driver:trip:{driverId} est posée côté serveur par le module Trips
   * à l'acceptation d'une course — jamais par le client.
   */
  async recordDriverLocation(
    driverId: string,
    loc: LocationUpdate,
  ): Promise<string | null> {
    await this.redis.geoadd('drivers:online', loc.lng, loc.lat, driverId);
    await this.redis.set(`driver:seen:${driverId}`, '1', 'EX', DRIVER_SEEN_TTL_SECONDS);
    const current = await this.redis.get(`driver:trip:${driverId}`);
    return current ?? this.activateUpcomingTrip(driverId);
  }

  /**
   * Courses programmées : le partage de position n'est pas activé à
   * l'acceptation (parfois des jours avant), mais ici, à T − 60 min.
   * Vérification limitée à une fois par minute et par chauffeur (les
   * positions arrivent toutes les 10 s).
   */
  private async activateUpcomingTrip(driverId: string): Promise<string | null> {
    const checked = await this.redis.set(`driver:next-trip-check:${driverId}`, '1', 'EX', 60, 'NX');
    if (checked !== 'OK') return null;

    let upcoming: { id: string } | null = null;
    try {
      upcoming = await this.prisma.trip.findFirst({
        where: {
          driverId,
          status: { in: ['accepted', 'started'] },
          scheduledAt: { lte: new Date(Date.now() + TRACKING_LEAD_MS) },
        },
        orderBy: { scheduledAt: 'asc' },
        select: { id: true },
      });
    } catch (err) {
      // Base indisponible : la position est quand même enregistrée.
      this.logger.error(`Recherche de course à venir impossible : ${(err as Error).message}`);
    }
    if (!upcoming) return null;
    await this.redis.set(`driver:trip:${driverId}`, upcoming.id, 'EX', 12 * 3600);
    return upcoming.id;
  }

  /**
   * Historise un point (sert au fallback polling 10 s et aux litiges).
   * Une erreur d'écriture ne doit pas bloquer le suivi en direct : on
   * journalise sans la position (donnée personnelle).
   */
  async saveTrackingPoint(
    tripId: string,
    driverId: string,
    loc: LocationUpdate,
  ): Promise<void> {
    try {
      await this.prisma.trackingPoint.create({
        data: {
          tripId,
          driverId,
          lat: loc.lat,
          lng: loc.lng,
          heading: loc.heading,
          speedKmh: loc.speed,
        },
      });
    } catch (err) {
      this.logger.error(
        `Échec d'enregistrement d'un point de suivi (trip ${tripId}) : ${(err as Error).message}`,
      );
    }
  }

  /** Retire le chauffeur du géo-index (plus aucune socket ouverte). */
  async removeDriverFromIndex(driverId: string): Promise<void> {
    await this.redis.zrem('drivers:online', driverId);
    await this.redis.del(`driver:seen:${driverId}`);
  }

  // ── Limites de débit ────────────────────────────────────────────────

  async allowMessage(userId: string): Promise<boolean> {
    return (await this.hit(`ws:msg:${userId}`, 60)) <= MESSAGE_MAX_PER_MINUTE;
  }

  async allowSos(userId: string): Promise<boolean> {
    return (await this.hit(`ws:sos:${userId}`, 60)) <= SOS_MAX_PER_MINUTE;
  }

  // ── SOS ─────────────────────────────────────────────────────────────

  /**
   * Enregistre l'alerte comme incident à suivre (dashboard admin, Module
   * 10) puis la place dans la file du worker SOS (SMS contact d'urgence,
   * Partie 7). Retourne l'identifiant de l'incident.
   *
   * Si la base est indisponible, l'alerte part QUAND MÊME (diffusion aux
   * admins + file Redis) : un SOS ne doit jamais être bloqué.
   */
  async queueSos(alert: SosAlert): Promise<string | null> {
    let incidentId: string | null = null;
    try {
      const incident = await this.prisma.incident.create({
        data: {
          type: 'sos',
          tripId: alert.tripId,
          userId: alert.userId,
          role: alert.role,
          lat: alert.position.lat,
          lng: alert.position.lng,
        },
        select: { id: true },
      });
      incidentId = incident.id;
    } catch (err) {
      this.logger.error(`SOS non persisté (trip ${alert.tripId}) : ${(err as Error).message}`);
    }
    await this.redis.lpush('sos:queue', JSON.stringify({ ...alert, incidentId }));
    return incidentId;
  }

  // ── Utilitaires ─────────────────────────────────────────────────────

  /** Même compteur à fenêtre fixe que AuthService.hit(). */
  private async hit(key: string, windowSeconds: number): Promise<number> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSeconds);
    }
    return count;
  }
}
