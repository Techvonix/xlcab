import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { PaymentsService } from '../payments/payments.service';
import { TrackingService } from '../tracking/tracking.service';
import { TripStatus } from '../matching/matching.constants';

export interface RequestUser {
  sub: string;
  role: string;
}

export interface AuditCtx {
  ipAddress?: string;
  userAgent?: string;
}

/** Même durée que l'access token (Module 2) : la blacklist couvre sa vie restante. */
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const EXPORTS_PER_DAY = 5;

// Courses qui empêchent la suppression : une réservation à venir ou en
// cours doit d'abord être annulée (remboursement selon les CGV) ou terminée.
const OPEN_STATUSES: string[] = [
  TripStatus.AWAITING_PAYMENT,
  TripStatus.PENDING,
  TripStatus.SEARCHING,
  TripStatus.NO_DRIVER,
  TripStatus.ACCEPTED,
  TripStatus.STARTED,
];

// Rôles supprimables depuis l'app. Un compte entreprise ou de l'équipe
// XLCAB se clôture avec le support (factures, accès des collaborateurs).
const SELF_DELETABLE_ROLES = ['passenger', 'driver', 'corporate_member'];

/**
 * Endpoints "Users" de la Partie 6 et droits RGPD de la Partie 8 :
 * accès (export), rectification (PATCH), effacement (anonymisation).
 * Le compte est toujours celui du jeton : aucun identifiant dans l'URL.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private audit: AuditService,
    private payments: PaymentsService,
    private tracking: TrackingService,
  ) {}

  // ── GET /users/me ───────────────────────────────────────────────────

  async me(user: RequestUser) {
    const u = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: {
        id: true, email: true, phone: true, firstName: true, lastName: true, role: true,
        locale: true, jurisdiction: true, createdAt: true, deletedAt: true,
      },
    });
    if (!u || u.deletedAt) throw new UnauthorizedException('Compte introuvable ou désactivé');
    const { deletedAt: _deleted, ...profile } = u;
    return profile;
  }

  // ── PATCH /users/me ─────────────────────────────────────────────────

  /** Rectification. Email, rôle et téléphone ne sont pas modifiables ici (vérification requise). */
  async update(user: RequestUser, data: { firstName?: string; lastName?: string; locale?: string }, ctx: AuditCtx) {
    await this.me(user);
    await this.prisma.user.update({ where: { id: user.sub }, data });
    await this.audit.log({ userId: user.sub, action: 'user.update', entity: 'User', entityId: user.sub, metadata: { fields: Object.keys(data) }, ...ctx });
    return this.me(user);
  }

  // ── GET /users/me/export ────────────────────────────────────────────

  /**
   * Droit d'accès et de portabilité : toutes les données liées au compte,
   * en JSON. Jamais de secret (mot de passe, clés Stripe, QR, jetons).
   */
  async export(user: RequestUser, ctx: AuditCtx) {
    const key = `users:export:rate:${user.sub}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 24 * 3600);
    if (count > EXPORTS_PER_DAY) {
      throw new HttpException('Trop d’exports aujourd’hui — réessayez demain', HttpStatus.TOO_MANY_REQUESTS);
    }

    const profile = await this.me(user);
    const consent = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { termsAcceptedAt: true, termsVersion: true },
    });
    const [trips, payments, notifications, driverProfile, vehicles, documents, addresses, preferences, ratingsGiven, trustedContacts] = await Promise.all([
      this.prisma.trip.findMany({
        where: { OR: [{ passengerId: user.sub }, { driverId: user.sub }] },
        select: {
          id: true, type: true, status: true, shuttleType: true, passengerId: true,
          originAddress: true, destinationAddress: true, scheduledAt: true, completedAt: true,
          cancelledAt: true, totalPriceCents: true, vatCents: true, cancellationFeeCents: true,
        },
        orderBy: { scheduledAt: 'desc' },
      }),
      this.prisma.payment.findMany({
        where: { userId: user.sub },
        select: { id: true, tripId: true, amountCents: true, currency: true, status: true, method: true, refundedCents: true, createdAt: true },
      }),
      this.prisma.notification.findMany({
        where: { userId: user.sub },
        select: { type: true, title: true, body: true, createdAt: true, readAt: true },
      }),
      this.prisma.driverProfile.findUnique({ where: { id: user.sub } }),
      this.prisma.vehicle.findMany({ where: { driverId: user.sub }, select: { brand: true, model: true, color: true, plate: true, capacity: true, shuttleType: true } }),
      this.prisma.driverDocument.findMany({ where: { userId: user.sub }, select: { type: true, status: true, uploadedAt: true } }),
      this.prisma.savedAddress.findMany({ where: { userId: user.sub }, select: { label: true, address: true, lat: true, lng: true, createdAt: true } }),
      this.prisma.userPreference.findUnique({ where: { userId: user.sub }, select: { notifyPush: true, notifyEmail: true, notifySms: true, marketing: true, autoShareTrips: true, preferWomanDriver: true, updatedAt: true } }),
      this.prisma.tripRating.findMany({ where: { passengerId: user.sub }, select: { tripId: true, stars: true, comment: true, createdAt: true } }),
      this.prisma.trustedContact.findMany({ where: { userId: user.sub }, select: { name: true, phone: true, createdAt: true } }),
    ]);

    await this.audit.log({ userId: user.sub, action: 'user.export', entity: 'User', entityId: user.sub, ...ctx });
    return {
      exportedAt: new Date(),
      profile,
      consent,
      trips: trips.map(({ passengerId, ...t }) => ({ ...t, role: passengerId === user.sub ? 'passenger' : 'driver' })),
      payments,
      notifications,
      addresses,
      preferences,
      ratingsGiven,
      trustedContacts,
      driver: driverProfile ? { profile: driverProfile, vehicles, documents } : null,
    };
  }

  // ── DELETE /users/me ────────────────────────────────────────────────

  /**
   * Droit à l'effacement (Partie 8 : anonymisation). Les courses et
   * paiements sont conservés sans identité (obligations comptables) ; les
   * justificatifs chauffeur restent archivés 10 ans (Partie 11.3). Toutes
   * les sessions sont révoquées.
   */
  async deleteAccount(user: RequestUser, password: string | undefined, accessToken: string | undefined, ctx: AuditCtx) {
    if (!SELF_DELETABLE_ROLES.includes(user.role)) {
      throw new ForbiddenException('Ce compte se clôture avec le support XLCAB (compte entreprise ou équipe)');
    }
    const account = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { passwordHash: true, deletedAt: true, stripeCustomerId: true },
    });
    if (!account || account.deletedAt) throw new UnauthorizedException('Compte introuvable ou désactivé');

    // Action irréversible : le mot de passe est redemandé (un téléphone
    // déverrouillé laissé sans surveillance ne suffit pas).
    if (account.passwordHash) {
      if (!password) throw new BadRequestException('Mot de passe requis pour supprimer le compte');
      // 403 et non 401 : un 401 ferait croire à l'app que la session a
      // expiré (rafraîchissement du jeton, voire déconnexion).
      if (!(await bcrypt.compare(password, account.passwordHash))) {
        throw new ForbiddenException('Mot de passe incorrect');
      }
    }

    const open = await this.prisma.trip.findFirst({
      where: { OR: [{ passengerId: user.sub }, { driverId: user.sub }], status: { in: OPEN_STATUSES } },
      select: { id: true, driverId: true },
    });
    if (open) {
      throw new ConflictException(
        open.driverId === user.sub
          ? 'Vous avez une course attribuée : terminez-la ou désistez-vous avant de supprimer le compte'
          : 'Annulez d’abord vos réservations à venir avant de supprimer le compte',
      );
    }

    await this.anonymize(user.sub, user.role, account.stripeCustomerId, accessToken);

    await this.audit.log({ userId: user.sub, action: 'user.delete', entity: 'User', entityId: user.sub, ...ctx });
    this.logger.log(`Compte anonymisé (utilisateur ${user.sub})`);
    return { deleted: true };
  }


  /**
   * Anonymisation (effacement RGPD) : identité effacée, sessions révoquées,
   * cartes supprimées chez Stripe. Courses, paiements et factures sont
   * conservés sans identité (obligations comptables). Utilisée par la
   * suppression à la demande et par la purge des comptes inactifs (3 ans).
   */
  async anonymize(userId: string, role: string, stripeCustomerId: string | null, accessToken?: string) {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          // Adresse unique mais non joignable (domaine réservé .invalid).
          email: `supprime-${userId}@anonyme.invalid`,
          phone: null,
          firstName: null,
          lastName: null,
          passwordHash: null,
          firebaseUid: null,
          stripeCustomerId: null,
          deletedAt: now,
          // termsAcceptedAt/termsVersion conservés : preuve du consentement passé.
        },
      });
      await tx.notification.deleteMany({ where: { userId: userId } });
      await tx.savedAddress.deleteMany({ where: { userId } });
      await tx.userPreference.deleteMany({ where: { userId } });
      // Espace sécurité : contacts (données de tiers) effacés, liens de suivi coupés.
      await tx.trustedContact.deleteMany({ where: { userId } });
      await tx.tripShare.deleteMany({ where: { userId } });
      // Notes conservées (moyenne du chauffeur), commentaires libres effacés.
      await tx.tripRating.updateMany({ where: { passengerId: userId }, data: { comment: null } });
      await tx.corporateMember.updateMany({ where: { userId: userId }, data: { isActive: false } });
      await tx.driverProfile.updateMany({ where: { id: userId }, data: { isOnline: false } });
      await tx.vehicle.updateMany({ where: { driverId: userId }, data: { isAvailable: false } });
    });

    await this.revokeSessions(userId, accessToken);
    if (role === 'driver') await this.tracking.removeDriverFromIndex(userId);
    // Cartes enregistrées : supprimées chez Stripe. Un échec n'empêche
    // pas l'effacement (tracé pour reprise).
    if (stripeCustomerId) await this.payments.deleteCustomer(stripeCustomerId);
  }

  /** Toutes les sessions (un refresh token par appareil) + l'access token courant. */
  private async revokeSessions(userId: string, accessToken: string | undefined) {
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', `refresh:${userId}:*`, 'COUNT', 100);
      if (keys.length > 0) await this.redis.del(...keys);
      cursor = next;
    } while (cursor !== '0');
    if (accessToken) await this.redis.set(`blacklist:${accessToken}`, '1', 'EX', ACCESS_TOKEN_TTL_SECONDS);
  }
}
