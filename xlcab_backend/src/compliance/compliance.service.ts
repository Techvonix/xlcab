import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TrackingService } from '../tracking/tracking.service';
import { UsersService } from '../users/users.service';

const DAY = 24 * 3600_000;

/** Rappels avant l'échéance d'un document chauffeur (jours). */
export const DOCUMENT_REMINDER_DAYS = [30, 7];
/** Partie 13 : « géoloc 30 j ». */
export const TRACKING_RETENTION_DAYS = 30;
/** Partie 8 : « 3 ans inactif → anonymisation auto ». */
export const INACTIVITY_YEARS = 3;
/** Rappel avant anonymisation (le client peut se reconnecter pour garder son compte). */
export const INACTIVITY_NOTICE_DAYS = 30;

// Comptes concernés par la purge : les comptes entreprise et équipe XLCAB
// se clôturent avec le support (factures, accès des collaborateurs).
const PURGEABLE_ROLES = ['passenger', 'driver', 'corporate_member'];
const OPEN_TRIP_STATUSES = ['awaiting_payment', 'pending', 'searching', 'no_driver', 'accepted', 'started', 'attached'];
const BATCH = 200;

export interface ComplianceReport {
  documentReminders: number;
  driversSuspended: number;
  trackingPointsPurged: number;
  inactivityNotices: number;
  accountsAnonymized: number;
}

interface Expiry {
  label: string;
  date: Date | null;
}

/**
 * Contrôles automatiques quotidiens (Partie 8) :
 * - documents chauffeur : rappels à J−30 et J−7, mise hors ligne le jour de
 *   l'expiration (le matching les écartait déjà, ceci prévient le chauffeur
 *   et coupe sa présence) ;
 * - positions GPS conservées 30 jours (Partie 13) ;
 * - comptes inactifs depuis 3 ans : rappel à J−30, puis anonymisation.
 */
@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private tracking: TrackingService,
    private users: UsersService,
  ) {}

  async runDaily(now = new Date()): Promise<ComplianceReport> {
    const step = async <T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        this.logger.error(`Contrôle « ${name} » en échec : ${(err as Error).message}`);
        return fallback;
      }
    };
    const docs = await step('documents', () => this.checkDriverDocuments(now), { reminders: 0, suspended: 0 });
    const report: ComplianceReport = {
      documentReminders: docs.reminders,
      driversSuspended: docs.suspended,
      trackingPointsPurged: await step('géolocalisation', () => this.purgeTrackingPoints(now), 0),
      ...(await step('comptes inactifs', () => this.handleInactiveAccounts(now), { inactivityNotices: 0, accountsAnonymized: 0 })),
    };
    await this.audit.log({ action: 'compliance.daily', entity: 'System', metadata: { ...report } });
    return report;
  }

  // ── Documents chauffeur ─────────────────────────────────────────────

  async checkDriverDocuments(now: Date) {
    const drivers = await this.prisma.driverProfile.findMany({
      where: { approvedAt: { not: null } },
      select: { id: true, isOnline: true, licenseExpiry: true, vtcCardExpiry: true },
    });
    const vehicles = await this.prisma.vehicle.findMany({
      where: { driverId: { in: drivers.map((d) => d.id) }, isAvailable: true },
      select: { driverId: true, plate: true, insuranceExpiry: true, technicalControlExpiry: true },
    });

    let reminders = 0;
    let suspended = 0;
    for (const d of drivers) {
      const own = vehicles.filter((v) => v.driverId === d.id);
      const items: Expiry[] = [
        { label: 'permis de conduire', date: d.licenseExpiry },
        { label: 'carte VTC', date: d.vtcCardExpiry },
        ...own.flatMap((v) => [
          { label: `assurance du véhicule ${v.plate}`, date: v.insuranceExpiry },
          { label: `contrôle technique du véhicule ${v.plate}`, date: v.technicalControlExpiry },
        ]),
      ];

      const expired = items.filter((i) => i.date && i.date.getTime() <= now.getTime());
      if (expired.length > 0) {
        // Hors ligne et retiré du géo-index : plus aucune mission.
        if (d.isOnline) {
          await this.prisma.driverProfile.update({ where: { id: d.id }, data: { isOnline: false } });
          await this.tracking.removeDriverFromIndex(d.id);
          await this.audit.log({ action: 'driver.documents_expired', entity: 'DriverProfile', entityId: d.id, metadata: { documents: expired.map((e) => e.label) } });
          suspended++;
        }
        for (const e of expired) {
          if (await this.once(`compliance:doc:${d.id}:${e.label}:expired:${e.date!.toISOString().slice(0, 10)}`, 400)) {
            await this.notifications.notify(d.id, 'driver.document_expired', 'Document expiré',
              `Votre ${e.label} a expiré : vous ne recevez plus de missions. Envoyez le nouveau document depuis l’application.`, { document: e.label });
            reminders++;
          }
        }
        continue;
      }

      for (const e of items) {
        if (!e.date) continue;
        const days = Math.ceil((e.date.getTime() - now.getTime()) / DAY);
        // Le plus petit seuil atteint (J−7 l'emporte sur J−30).
        const threshold = [...DOCUMENT_REMINDER_DAYS].sort((a, b) => a - b).find((t) => days <= t);
        if (threshold === undefined) continue;
        // Un rappel par seuil et par échéance (une nouvelle date relance les rappels).
        if (await this.once(`compliance:doc:${d.id}:${e.label}:${threshold}:${e.date.toISOString().slice(0, 10)}`, 400)) {
          await this.notifications.notify(d.id, 'driver.document_expiring', 'Document bientôt expiré',
            `Votre ${e.label} expire dans ${days} jour${days > 1 ? 's' : ''}. Envoyez le nouveau document pour continuer à recevoir des missions.`,
            { document: e.label, days });
          reminders++;
        }
      }
    }
    return { reminders, suspended };
  }

  // ── Géolocalisation (30 jours) ──────────────────────────────────────

  async purgeTrackingPoints(now: Date) {
    const res = await this.prisma.trackingPoint.deleteMany({
      where: { recordedAt: { lt: new Date(now.getTime() - TRACKING_RETENTION_DAYS * DAY) } },
    });
    return res.count;
  }

  // ── Comptes inactifs (3 ans) ────────────────────────────────────────

  async handleInactiveAccounts(now: Date) {
    const limit = this.yearsBefore(now, INACTIVITY_YEARS);
    const noticeLimit = new Date(limit.getTime() + INACTIVITY_NOTICE_DAYS * DAY);
    const candidates = await this.prisma.user.findMany({
      where: { deletedAt: null, role: { in: PURGEABLE_ROLES }, createdAt: { lt: noticeLimit } },
      select: { id: true, role: true, createdAt: true, stripeCustomerId: true },
      take: BATCH * 5,
    });
    const activity = await this.prisma.userActivity.findMany({ where: { userId: { in: candidates.map((c) => c.id) } } });
    const lastSeen = new Map(activity.map((a) => [a.userId, a.lastSeenAt]));

    let inactivityNotices = 0;
    let accountsAnonymized = 0;
    for (const u of candidates) {
      // Dernière trace : activité enregistrée, sinon dernière course, sinon création.
      const lastTrip = await this.prisma.trip.findFirst({
        where: { OR: [{ passengerId: u.id }, { driverId: u.id }] },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, status: true },
      });
      const last = new Date(Math.max(lastSeen.get(u.id)?.getTime() ?? 0, lastTrip?.createdAt.getTime() ?? 0, u.createdAt.getTime()));
      if (last >= noticeLimit) continue;

      if (last < limit) {
        // Jamais avec une course en cours ou à venir.
        const open = await this.prisma.trip.count({
          where: { OR: [{ passengerId: u.id }, { driverId: u.id }], status: { in: OPEN_TRIP_STATUSES } },
        });
        if (open > 0) continue;
        await this.users.anonymize(u.id, u.role, u.stripeCustomerId);
        await this.audit.log({ action: 'user.retention_anonymized', entity: 'User', entityId: u.id, metadata: { lastActivity: last } });
        accountsAnonymized++;
        if (accountsAnonymized >= BATCH) break;
      } else if (await this.once(`compliance:inactive-notice:${u.id}`, 60)) {
        await this.notifications.notify(u.id, 'account.inactivity_notice', 'Votre compte XLCAB va être supprimé',
          `Sans connexion de votre part d’ici ${INACTIVITY_NOTICE_DAYS} jours, votre compte sera anonymisé (inactif depuis près de ${INACTIVITY_YEARS} ans). Connectez-vous pour le conserver.`);
        inactivityNotices++;
      }
    }
    return { inactivityNotices, accountsAnonymized };
  }

  private yearsBefore(now: Date, years: number) {
    const d = new Date(now);
    d.setUTCFullYear(d.getUTCFullYear() - years);
    return d;
  }

  /** true la première fois pour cette clé (déduplication des rappels). */
  private async once(key: string, ttlDays: number) {
    return (await this.redis.set(key, '1', 'EX', ttlDays * 24 * 3600, 'NX')) === 'OK';
  }
}
