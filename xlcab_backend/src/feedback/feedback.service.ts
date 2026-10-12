import { ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { TripStatus } from '../matching/matching.constants';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { recomputeDriverRating } from './driver-rating';

interface RequestUser {
  sub: string;
  role: string;
}

interface AuditCtx {
  ipAddress?: string;
  userAgent?: string;
}

/** Délai pour noter un trajet après son arrivée. */
export const RATING_WINDOW_DAYS = 7;

/** Motifs de signalement d'un chauffeur (écran 10, bouton « Signaler »). */
/** Étiquettes rapides d'une note (ce que le passager a apprécié). Liste fermée : l'app les traduit. */
export const RATING_TAGS = ['conduite_sure', 'ponctuel', 'vehicule_propre', 'accueil', 'colis_soigne'] as const;
export type RatingTag = (typeof RATING_TAGS)[number];

export const REPORT_REASONS = ['comportement', 'conduite', 'vehicule', 'retard', 'autre'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

const REASON_LABELS: Record<ReportReason, string> = {
  comportement: 'Comportement du chauffeur',
  conduite: 'Conduite dangereuse',
  vehicule: 'État du véhicule',
  retard: 'Retard important',
  autre: 'Autre',
};

/** Le chauffeur est visible du passager une fois engagé, et après la course. */
const DRIVER_VISIBLE = new Set<string>([TripStatus.ACCEPTED, TripStatus.STARTED, TripStatus.COMPLETED]);

/**
 * Écran 10 (Partie 7) : profil du chauffeur vu par le passager, note après
 * le trajet, signalement. Contrôle d'ownership (Partie 8) : seul le passager
 * de la course y a accès, jamais un autre utilisateur.
 */
@Injectable()
export class FeedbackService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private audit: AuditService,
  ) {}

  /** Course du passager avec chauffeur engagé ; 404 sinon (on ne révèle rien). */
  private async passengerTrip(user: RequestUser, tripId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip || trip.passengerId !== user.sub || !trip.driverId || !DRIVER_VISIBLE.has(trip.status)) {
      throw new NotFoundException('Chauffeur introuvable pour cette course');
    }
    return trip as typeof trip & { driverId: string };
  }

  // ── GET /trips/:id/driver ──────────────────────────────────────────────

  async driverProfile(user: RequestUser, tripId: string) {
    const trip = await this.passengerTrip(user, tripId);
    const [driver, profile, vehicle, myRating] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: trip.driverId }, select: { firstName: true } }),
      this.prisma.driverProfile.findUnique({ where: { id: trip.driverId } }),
      trip.vehicleId ? this.prisma.vehicle.findUnique({ where: { id: trip.vehicleId } }) : null,
      this.prisma.tripRating.findUnique({ where: { tripId } }),
    ]);
    const ratingCount = profile?.ratingCount ?? 0;

    return {
      // Prénom seulement : le nom complet n'est pas utile au passager.
      firstName: driver?.firstName ?? 'Votre chauffeur',
      // Pas de note tant qu'aucun passager n'a noté (la valeur par défaut 5,00 serait trompeuse).
      rating: ratingCount > 0 ? Number(profile?.rating) : null,
      ratingCount,
      totalTrips: profile?.totalTrips ?? 0,
      languages: profile?.languages ?? [],
      pmrTrained: profile?.pmrTrained ?? false,
      vehicle: vehicle
        ? {
            brand: vehicle.brand,
            model: vehicle.model,
            color: vehicle.color,
            // Plaque : utile pour reconnaître le véhicule avant et pendant la course.
            plate: trip.status === TripStatus.COMPLETED ? null : vehicle.plate,
            shuttleType: vehicle.shuttleType,
            capacity: vehicle.capacity,
            pmrEquipped: vehicle.pmrEquipped,
            dashcamActive: vehicle.dashcamActive,
          }
        : null,
      myRating: myRating ? { stars: myRating.stars, createdAt: myRating.createdAt } : null,
      canRate: !myRating && this.withinRatingWindow(trip),
    };
  }

  private withinRatingWindow(trip: { status: string; completedAt: Date | null }) {
    if (trip.status !== TripStatus.COMPLETED || !trip.completedAt) return false;
    return Date.now() - new Date(trip.completedAt).getTime() <= RATING_WINDOW_DAYS * 24 * 3600 * 1000;
  }

  // ── POST /trips/:id/rating ─────────────────────────────────────────────

  async rate(user: RequestUser, tripId: string, stars: number, comment: string | undefined, ctx: AuditCtx, tags: RatingTag[] = []) {
    const trip = await this.passengerTrip(user, tripId);
    if (trip.status !== TripStatus.COMPLETED) throw new ForbiddenException('Vous pourrez noter le trajet une fois arrivé');
    if (!this.withinRatingWindow(trip)) throw new ForbiddenException(`La note doit être donnée dans les ${RATING_WINDOW_DAYS} jours suivant le trajet`);
    if (await this.prisma.tripRating.findUnique({ where: { tripId } })) throw new ConflictException('Vous avez déjà noté ce trajet');

    let rating;
    try {
      rating = await this.prisma.tripRating.create({
        data: { tripId, passengerId: user.sub, driverId: trip.driverId, stars, comment: comment || null, tags },
      });
    } catch {
      // Deux envois simultanés : l'index unique sur tripId garde le premier.
      throw new ConflictException('Vous avez déjà noté ce trajet');
    }

    await recomputeDriverRating(this.prisma, trip.driverId);

    await this.audit.log({ userId: user.sub, action: 'trip.rated', entity: 'Trip', entityId: tripId, metadata: { stars, tags }, ...ctx });
    return { stars: rating.stars, tags, createdAt: rating.createdAt };
  }

  // ── POST /trips/:id/report ─────────────────────────────────────────────

  async report(user: RequestUser, tripId: string, reason: ReportReason, details: string | undefined, ctx: AuditCtx) {
    const trip = await this.passengerTrip(user, tripId);

    // Un signalement en cours par course (un second écrase pas le premier : l'équipe le traite).
    const existing = await this.prisma.incident.findFirst({ where: { tripId, userId: user.sub, type: 'driver_report', status: { not: 'resolved' } } });
    if (existing) throw new ConflictException('Votre signalement est déjà entre les mains de notre équipe');

    // Anti-abus : 5 signalements par jour et par passager.
    const key = `feedback:report:${user.sub}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 24 * 3600);
    if (count > 5) throw new HttpException('Trop de signalements aujourd’hui — contactez le support', HttpStatus.TOO_MANY_REQUESTS);

    const incident = await this.prisma.incident.create({
      data: {
        type: 'driver_report',
        tripId,
        userId: user.sub,
        role: 'passenger',
        // Position de référence : départ de la course (le signalement n'est pas géolocalisé).
        lat: trip.originLat ?? 0,
        lng: trip.originLng ?? 0,
        notes: details ? `${REASON_LABELS[reason]} — ${details}` : REASON_LABELS[reason],
      },
    });
    await this.audit.log({ userId: user.sub, action: 'driver.reported', entity: 'Incident', entityId: incident.id, metadata: { tripId, reason }, ...ctx });
    return { id: incident.id, status: incident.status };
  }
}
