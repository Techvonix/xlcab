import {
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import Stripe = require('stripe');
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { TripStatus } from '../matching/matching.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { STRIPE_CLIENT } from '../payments/stripe.provider';
import { PrismaService } from '../prisma/prisma.service';
import { TwoFactorGuard } from '../two-factor/two-factor.guard';
import { PayoutAccountsService } from './payout-accounts';

// Reversement à l'opérateur (Stripe Connect, étape 4).
//
// Décision du 2026-10-13 : le passager paie la plateforme à la réservation ;
// une fois le trajet TERMINÉ, la part de celui qui l'a réellement assuré
// (le chauffeur de la course à cet instant : titulaire, ou secours qui a
// repris le départ) est virée sur son compte de versement. XLCAB garde sa
// commission, figée à la réservation, et la TVA qu'il doit reverser.
//
// Seules les courses des lignes et de la bourse payées en ligne sont
// concernées ; les courses instantanées restent hors de ce circuit.

const HOUR = 3600_000;
/** Compte de versement pas encore prêt : on revérifie chaque heure. */
const BLOCKED_RETRY_MS = HOUR;
/** Incident Stripe : 5 min, 10, 20… plafonné à 6 h ; au-delà de 10 essais, l'équipe reprend la main. */
const FAILED_BASE_RETRY_MS = 5 * 60_000;
const FAILED_MAX_RETRY_MS = 6 * HOUR;
export const PAYOUT_MAX_ATTEMPTS = 10;
/** Filet de sécurité : courses terminées depuis moins de 7 jours sans reversement enregistré. */
const SWEEP_DAYS = 7;
/** Reversement resté « en préparation » (arrêt du serveur au mauvais moment) : repris après ce délai. */
const DRAFT_STALE_MS = 5 * 60_000;

/**
 * Part maximale d'un reversement qui peut être retenue pour une pénalité
 * d'annulation (PENALTY_WITHHOLD_PERCENT, 100 par défaut : la pénalité est
 * recouvrée sur les premiers reversements). À VALIDER par le porteur de projet.
 */
export function penaltyWithholdPercent(): number {
  const value = Number(process.env.PENALTY_WITHHOLD_PERCENT);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : 100;
}

export const PAYOUT_STATUSES = ['draft', 'pending', 'paid', 'blocked', 'failed', 'withheld', 'void'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

const euros = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

type PayoutRow = {
  id: string;
  tripId: string;
  driverId: string;
  grossCents: number;
  withheldCents: number;
  amountCents: number;
  status: string;
  attempts: number;
  stripeTransferId: string | null;
  nextAttemptAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  paidAt: Date | null;
};

type BonusRow = {
  id: string;
  driverId: string;
  departureId: string;
  penaltyId: string | null;
  amountCents: number;
  status: string;
  attempts: number;
  nextAttemptAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  paidAt: Date | null;
};

/** Part de l'opérateur : prix hors taxes moins la commission XLCAB (comme l'écran « Revenus »). */
export function operatorShareCents(trip: { totalPriceCents: number | null; vatCents: number | null; commissionCents: number | null }): number {
  return Math.max(0, (trip.totalPriceCents ?? 0) - (trip.vatCents ?? 0) - (trip.commissionCents ?? 0));
}

@Injectable()
export class TripPayoutsService {
  private readonly logger = new Logger(TripPayoutsService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(STRIPE_CLIENT) private stripe: Stripe | null,
    private accounts: PayoutAccountsService,
    private notifications: NotificationsService,
    private audit: AuditService,
  ) {}

  /**
   * Fin de course : enregistre le reversement dû et tente le virement. Ne
   * lève jamais d'erreur (la course est terminée quoi qu'il arrive) : un
   * virement non parti est repris par le planificateur.
   */
  async onTripCompleted(tripId: string, now = new Date()): Promise<void> {
    try {
      const payout = await this.register(tripId);
      if (payout && payout.status === 'pending') await this.attempt(payout, now);
    } catch (err) {
      this.logger.error(`Reversement de la course ${tripId} non traité : ${(err as Error).message}`);
    }
  }

  /** Crée le reversement d'une course terminée et payée en ligne (une seule fois par course). */
  private async register(tripId: string): Promise<PayoutRow | null> {
    const existing = await this.prisma.payout.findUnique({ where: { tripId } });
    if (existing) return existing as PayoutRow;

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, status: true, source: true, driverId: true, totalPriceCents: true, vatCents: true, commissionCents: true, paidWithTripId: true },
    });
    if (!trip || trip.status !== TripStatus.COMPLETED || !trip.driverId || !trip.source || trip.source === 'instant') return null;
    const payment = await this.paymentOf(trip.id, trip.paidWithTripId);
    if (!payment) return null; // réservation sans encaissement en ligne (paiement différé)

    // Jamais plus que ce qui reste encaissé (remboursement accordé entre-temps par l'équipe).
    const grossCents = Math.min(operatorShareCents(trip), Math.max(0, payment.amountCents - payment.refundedCents));
    try {
      // « draft » : rien ne peut être viré tant que les retenues ne sont pas calculées.
      const draft = (await this.prisma.payout.create({
        data: { tripId, driverId: trip.driverId, paymentId: payment.id, grossCents, withheldCents: 0, amountCents: grossCents, currency: 'EUR', status: 'draft' },
      })) as PayoutRow;
      return await this.finalize(draft);
    } catch (err: any) {
      // Deux fins de course simultanées : la contrainte d'unicité garde un seul reversement.
      if (err?.code === 'P2002') return (await this.prisma.payout.findUnique({ where: { tripId } })) as PayoutRow;
      throw err;
    }
  }

  /**
   * Retient sur ce reversement les pénalités d'annulation dues par le
   * chauffeur (appliquées, donc hors délai de contestation et non
   * contestées), les plus anciennes d'abord, puis fixe le montant à virer.
   * Rejouable : reprend là où une exécution interrompue s'était arrêtée.
   */
  private async finalize(draft: PayoutRow): Promise<PayoutRow> {
    const already = (await this.prisma.payoutDeduction.findMany({ where: { payoutId: draft.id }, select: { amountCents: true } })).reduce(
      (sum: number, d: { amountCents: number }) => sum + d.amountCents, 0,
    );
    const ceiling = Math.floor((draft.grossCents * penaltyWithholdPercent()) / 100);
    let withheld = already;

    const penalties = await this.prisma.driverPenalty.findMany({ where: { driverId: draft.driverId, status: 'applied', collectedAt: null }, orderBy: { createdAt: 'asc' } });
    for (const penalty of penalties) {
      const room = ceiling - withheld;
      if (room <= 0) break;
      const part = Math.min(room, penalty.amountCents - penalty.collectedCents);
      if (part <= 0) continue;
      const collected = penalty.collectedCents + part;
      const taken = await this.prisma.$transaction(async (tx) => {
        // Écriture conditionnelle : deux reversements simultanés ne retiennent pas deux fois la même somme.
        const { count } = await tx.driverPenalty.updateMany({
          where: { id: penalty.id, status: 'applied', collectedCents: penalty.collectedCents },
          data: { collectedCents: collected, collectedAt: collected >= penalty.amountCents ? new Date() : null },
        });
        if (count === 0) return false;
        await tx.payoutDeduction.create({ data: { payoutId: draft.id, penaltyId: penalty.id, amountCents: part } });
        return true;
      });
      if (!taken) continue;
      withheld += part;
      await this.audit.log({
        action: 'payout.penalty_withheld', entity: 'DriverPenalty', entityId: penalty.id,
        metadata: { payoutId: draft.id, amountCents: part, collectedCents: collected, penaltyCents: penalty.amountCents },
      });
    }

    const amountCents = draft.grossCents - withheld;
    const status = amountCents > 0 ? 'pending' : withheld > 0 ? 'withheld' : 'void';
    const payout = (await this.prisma.payout.update({ where: { id: draft.id }, data: { withheldCents: withheld, amountCents, status } })) as PayoutRow;
    if (withheld > already) {
      const stillDue = (await this.prisma.driverPenalty.findMany({ where: { driverId: draft.driverId, status: 'applied', collectedAt: null } })).reduce(
        (sum: number, p: { amountCents: number; collectedCents: number }) => sum + p.amountCents - p.collectedCents, 0,
      );
      await this.notifications.notify(
        draft.driverId, 'payout.withheld', 'Pénalité retenue',
        stillDue > 0
          ? `${euros(withheld)} € ont été retenus sur votre revenu au titre d’une pénalité d’annulation. Reste dû : ${euros(stillDue)} €.`
          : `${euros(withheld)} € ont été retenus sur votre revenu au titre d’une pénalité d’annulation. Elle est maintenant soldée.`,
        { tripId: draft.tripId },
      );
    }
    return payout;
  }

  /** Tente le virement. Compte de versement absent : en attente, l'opérateur est prévenu une fois. */
  private async attempt(payout: PayoutRow, now: Date): Promise<PayoutStatus> {
    if (!this.stripe) {
      await this.prisma.payout.update({ where: { id: payout.id }, data: { nextAttemptAt: new Date(now.getTime() + BLOCKED_RETRY_MS) } });
      return 'pending';
    }
    const accountId = await this.accounts.readyAccountId(payout.driverId);
    if (!accountId) {
      await this.prisma.payout.update({ where: { id: payout.id }, data: { status: 'blocked', nextAttemptAt: new Date(now.getTime() + BLOCKED_RETRY_MS) } });
      if (payout.status !== 'blocked') {
        await this.notifications.notify(
          payout.driverId, 'payout.blocked', 'Revenu en attente',
          `${euros(payout.amountCents)} € vous attendent : ouvrez ou complétez votre compte de versement pour les recevoir.`, { tripId: payout.tripId },
        );
      }
      return 'blocked';
    }

    try {
      const full = await this.prisma.payout.findUnique({ where: { id: payout.id } });
      const payment = full?.paymentId ? await this.prisma.payment.findUnique({ where: { id: full.paymentId } }) : null;
      if (!payment?.stripePaymentIntentId) throw new Error('paiement introuvable');
      const intent = await this.stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
      const chargeId = typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge?.id;
      if (!chargeId) throw new Error('encaissement introuvable chez Stripe');

      const transfer = await this.stripe.transfers.create(
        {
          amount: payout.amountCents,
          currency: 'eur',
          destination: accountId,
          // Rattaché à l'encaissement de la course : le virement part même si les fonds
          // ne sont pas encore disponibles sur le solde de la plateforme.
          source_transaction: chargeId,
          description: `Course XLCAB ${payout.tripId}`,
          metadata: { tripId: payout.tripId, payoutId: payout.id },
        },
        // Une nouvelle tentative ne vire jamais deux fois.
        { idempotencyKey: `payout-${payout.id}-${accountId}` },
      );
      await this.prisma.payout.update({
        where: { id: payout.id },
        data: { status: 'paid', stripeTransferId: transfer.id, stripeAccountId: accountId, paidAt: now, nextAttemptAt: null, lastError: null, attempts: payout.attempts + 1 },
      });
      await this.audit.log({ action: 'payout.paid', entity: 'Payout', entityId: payout.id, metadata: { tripId: payout.tripId, amountCents: payout.amountCents } });
      await this.notifications.notify(
        payout.driverId, 'payout.paid', 'Revenu versé', `${euros(payout.amountCents)} € ont été versés sur votre compte de versement.`, { tripId: payout.tripId },
      );
      return 'paid';
    } catch (err) {
      const attempts = payout.attempts + 1;
      const delay = Math.min(FAILED_BASE_RETRY_MS * 2 ** (attempts - 1), FAILED_MAX_RETRY_MS);
      await this.prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: 'failed', attempts, lastError: String((err as Error).message).slice(0, 300),
          // Au-delà du nombre d'essais, plus de reprise automatique : l'équipe relance à la main.
          nextAttemptAt: attempts >= PAYOUT_MAX_ATTEMPTS ? null : new Date(now.getTime() + delay),
        },
      });
      this.logger.error(`Reversement ${payout.id} échoué (essai ${attempts}) : ${(err as Error).message}`);
      if (attempts === PAYOUT_MAX_ATTEMPTS) {
        await this.audit.log({ action: 'payout.abandoned', entity: 'Payout', entityId: payout.id, metadata: { tripId: payout.tripId, amountCents: payout.amountCents } });
      }
      return 'failed';
    }
  }

  /**
   * Planificateur (chaque minute) : reversements à reprendre (compte de
   * versement ouvert depuis, incident Stripe passé) et courses terminées
   * dont le reversement n'aurait pas été enregistré.
   */
  async tick(now = new Date()) {
    const report = { paid: 0, blocked: 0, failed: 0, registered: 0, bonusesPaid: 0 };

    const completed = await this.prisma.trip.findMany({
      where: { status: TripStatus.COMPLETED, source: { in: ['line', 'market'] }, completedAt: { gte: new Date(now.getTime() - SWEEP_DAYS * 24 * HOUR) } },
      select: { id: true },
      take: 500,
    });
    if (completed.length > 0) {
      const known = await this.prisma.payout.findMany({ where: { tripId: { in: completed.map((t) => t.id) } }, select: { tripId: true } });
      const have = new Set(known.map((p) => p.tripId));
      for (const trip of completed.filter((t) => !have.has(t.id))) {
        try {
          if (await this.register(trip.id)) report.registered++;
        } catch (err) {
          this.logger.error(`Reversement de la course ${trip.id} non enregistré : ${(err as Error).message}`);
        }
      }
    }

    // Reversements restés en préparation (serveur arrêté pendant le calcul des retenues).
    const drafts = (await this.prisma.payout.findMany({ where: { status: 'draft', createdAt: { lte: new Date(now.getTime() - DRAFT_STALE_MS) } }, take: 100 })) as PayoutRow[];
    for (const draft of drafts) {
      try {
        await this.finalize(draft);
      } catch (err) {
        this.logger.error(`Reversement ${draft.id} non finalisé : ${(err as Error).message}`);
      }
    }

    const due = (await this.prisma.payout.findMany({
      where: { status: { in: ['pending', 'blocked', 'failed'] }, nextAttemptAt: { lte: now } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    })) as PayoutRow[];
    // Reversements tout juste enregistrés par le filet de sécurité : jamais tentés.
    const fresh = (await this.prisma.payout.findMany({ where: { status: 'pending', nextAttemptAt: null, attempts: 0 }, take: 100 })) as PayoutRow[];
    for (const payout of [...due, ...fresh]) {
      const status = await this.attempt(payout, now);
      if (status !== 'pending') report[status as 'paid' | 'blocked' | 'failed']++;
    }
    report.bonusesPaid = await this.payBonuses(now);
    return report;
  }

  // ── Bonus de reprise du chauffeur de secours ────────────────────────
  //
  // Le bonus (160 €) est financé par la pénalité du chauffeur défaillant :
  // « pas de bonus sans pénalité encaissée ». Il est viré dès que la
  // pénalité a été recouvrée à hauteur du bonus (le secours passe avant la
  // part des avoirs passagers) — règle À VALIDER par le porteur de projet.
  // Le virement vient du solde de la plateforme (pas d'encaissement lié).

  /** Bonus dont la pénalité est suffisamment recouvrée : virés. Renvoie le nombre de bonus versés. */
  async payBonuses(now = new Date()): Promise<number> {
    if (!this.stripe) return 0;
    const bonuses = (await this.prisma.driverBonus.findMany({
      where: { status: { in: ['pending', 'blocked', 'failed'] }, penaltyId: { not: null } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    })) as BonusRow[];
    let paid = 0;
    for (const bonus of bonuses) {
      if (bonus.nextAttemptAt && bonus.nextAttemptAt > now) continue;
      try {
        if (!(await this.bonusFunded(bonus))) continue;
        if ((await this.attemptBonus(bonus, now)) === 'paid') paid++;
      } catch (err) {
        this.logger.error(`Bonus ${bonus.id} non traité : ${(err as Error).message}`);
      }
    }
    return paid;
  }

  /** La pénalité qui finance ce bonus est due (appliquée) et recouvrée à hauteur du bonus. */
  private async bonusFunded(bonus: BonusRow): Promise<boolean> {
    const penalty = bonus.penaltyId ? await this.prisma.driverPenalty.findUnique({ where: { id: bonus.penaltyId } }) : null;
    return !!penalty && penalty.status === 'applied' && penalty.collectedCents >= Math.min(bonus.amountCents, penalty.amountCents);
  }

  private async attemptBonus(bonus: BonusRow, now: Date): Promise<'paid' | 'blocked' | 'failed'> {
    const accountId = await this.accounts.readyAccountId(bonus.driverId);
    if (!accountId) {
      await this.prisma.driverBonus.update({ where: { id: bonus.id }, data: { status: 'blocked', nextAttemptAt: new Date(now.getTime() + BLOCKED_RETRY_MS) } });
      if (bonus.status !== 'blocked') {
        await this.notifications.notify(
          bonus.driverId, 'payout.blocked', 'Revenu en attente',
          `${euros(bonus.amountCents)} € vous attendent : ouvrez ou complétez votre compte de versement pour les recevoir.`, { departureId: bonus.departureId },
        );
      }
      return 'blocked';
    }
    try {
      const transfer = await this.stripe!.transfers.create(
        {
          amount: bonus.amountCents,
          currency: 'eur',
          destination: accountId,
          description: `Bonus de reprise XLCAB ${bonus.departureId}`,
          metadata: { bonusId: bonus.id, departureId: bonus.departureId },
        },
        { idempotencyKey: `bonus-${bonus.id}-${accountId}` },
      );
      await this.prisma.driverBonus.update({
        where: { id: bonus.id },
        data: { status: 'paid', stripeTransferId: transfer.id, stripeAccountId: accountId, paidAt: now, nextAttemptAt: null, lastError: null, attempts: bonus.attempts + 1 },
      });
      await this.audit.log({ action: 'bonus.paid', entity: 'DriverBonus', entityId: bonus.id, metadata: { departureId: bonus.departureId, amountCents: bonus.amountCents } });
      await this.notifications.notify(
        bonus.driverId, 'bonus.paid', 'Bonus de reprise versé', `${euros(bonus.amountCents)} € ont été versés sur votre compte de versement.`, { departureId: bonus.departureId },
      );
      return 'paid';
    } catch (err) {
      const attempts = bonus.attempts + 1;
      const delay = Math.min(FAILED_BASE_RETRY_MS * 2 ** (attempts - 1), FAILED_MAX_RETRY_MS);
      await this.prisma.driverBonus.update({
        where: { id: bonus.id },
        data: {
          status: 'failed', attempts, lastError: String((err as Error).message).slice(0, 300),
          nextAttemptAt: attempts >= PAYOUT_MAX_ATTEMPTS ? null : new Date(now.getTime() + delay),
        },
      });
      this.logger.error(`Bonus ${bonus.id} non viré (essai ${attempts}) : ${(err as Error).message}`);
      if (attempts === PAYOUT_MAX_ATTEMPTS) {
        await this.audit.log({ action: 'bonus.abandoned', entity: 'DriverBonus', entityId: bonus.id, metadata: { amountCents: bonus.amountCents } });
      }
      return 'failed';
    }
  }

  /** Équipe XLCAB : bonus de reprise et où en est leur virement. */
  async adminBonuses() {
    const rows = (await this.prisma.driverBonus.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })) as BonusRow[];
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.driverId) } }, select: { id: true, firstName: true, lastName: true, email: true } });
    const penalties = await this.prisma.driverPenalty.findMany({ where: { id: { in: rows.map((r) => r.penaltyId).filter((x): x is string => !!x) } } });
    return rows.map((r) => {
      const u = users.find((x) => x.id === r.driverId);
      const p = penalties.find((x) => x.id === r.penaltyId);
      return {
        id: r.id, driverId: r.driverId, departureId: r.departureId, amountCents: r.amountCents, status: r.status, attempts: r.attempts, lastError: r.lastError,
        createdAt: r.createdAt, paidAt: r.paidAt,
        driverName: [u?.firstName, u?.lastName].filter(Boolean).join(' ') || null,
        // Ce qui a déjà été recouvré sur la pénalité qui finance ce bonus.
        penaltyCollectedCents: p?.collectedCents ?? 0,
        penaltyCents: p?.amountCents ?? 0,
        needsAttention: r.status === 'failed' && r.attempts >= PAYOUT_MAX_ATTEMPTS,
      };
    });
  }

  /** Équipe XLCAB : relance immédiate du virement d'un bonus (seulement s'il est financé). */
  async adminRetryBonus(adminId: string, bonusId: string, ctx: { ipAddress?: string; userAgent?: string }, now = new Date()) {
    const bonus = (await this.prisma.driverBonus.findUnique({ where: { id: bonusId } })) as BonusRow | null;
    if (!bonus) throw new NotFoundException('Bonus introuvable');
    if (bonus.status === 'paid') throw new ConflictException('Ce bonus est déjà versé');
    if (!(await this.bonusFunded(bonus))) throw new ConflictException('La pénalité qui finance ce bonus n’est pas encore recouvrée');
    if (!this.stripe) throw new ConflictException('Paiement momentanément indisponible');
    const status = await this.attemptBonus(bonus, now);
    await this.audit.log({ userId: adminId, action: 'bonus.retry', entity: 'DriverBonus', entityId: bonusId, metadata: { status }, ...ctx });
    return { id: bonusId, status };
  }

  // ── Vues ────────────────────────────────────────────────────────────

  /** Reversements d'un opérateur : versés, en attente (et pourquoi). Jamais d'identifiant Stripe. */
  async mine(driverId: string) {
    const rows = (await this.prisma.payout.findMany({ where: { driverId }, orderBy: { createdAt: 'desc' }, take: 50 })) as PayoutRow[];
    const trips = await this.prisma.trip.findMany({
      where: { id: { in: rows.map((r) => r.tripId) } },
      select: { id: true, originAddress: true, destinationAddress: true, scheduledAt: true },
    });
    const sum = (statuses: string[]) => rows.filter((r) => statuses.includes(r.status)).reduce((s, r) => s + r.amountCents, 0);
    const bonuses = (await this.prisma.driverBonus.findMany({ where: { driverId }, orderBy: { createdAt: 'desc' }, take: 20 })) as BonusRow[];
    return {
      // Bonus de reprise (départs sauvés) : versés quand la pénalité du chauffeur défaillant est recouvrée.
      bonuses: bonuses.map((b) => ({ id: b.id, amountCents: b.amountCents, status: b.status === 'paid' ? 'paid' : b.status === 'blocked' ? 'blocked' : 'pending', createdAt: b.createdAt, paidAt: b.paidAt })),
      paidCents: sum(['paid']),
      pendingCents: sum(['draft', 'pending', 'blocked', 'failed']),
      // Pénalités d'annulation retenues sur ces reversements.
      withheldCents: rows.reduce((s, r) => s + r.withheldCents, 0),
      items: rows
        .filter((r) => r.status !== 'void')
        .map((r) => {
          const trip = trips.find((t) => t.id === r.tripId);
          return {
            id: r.id,
            tripId: r.tripId,
            amountCents: r.amountCents,
            grossCents: r.grossCents,
            withheldCents: r.withheldCents,
            // Un incident technique est « en cours » pour l'opérateur : il n'a rien à faire.
            status: r.status === 'failed' || r.status === 'draft' ? 'pending' : r.status,
            paidAt: r.paidAt,
            createdAt: r.createdAt,
            originAddress: trip?.originAddress ?? null,
            destinationAddress: trip?.destinationAddress ?? null,
            scheduledAt: trip?.scheduledAt ?? null,
          };
        }),
    };
  }

  /** Équipe XLCAB : reversements, les problèmes d'abord. */
  async adminList(status?: string) {
    const rows = (await this.prisma.payout.findMany({
      where: status ? { status } : { status: { in: ['failed', 'blocked', 'pending'] } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    })) as PayoutRow[];
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.driverId) } }, select: { id: true, firstName: true, lastName: true, email: true } });
    return rows.map((r) => {
      const u = users.find((x) => x.id === r.driverId);
      return {
        id: r.id, tripId: r.tripId, driverId: r.driverId, amountCents: r.amountCents, grossCents: r.grossCents, withheldCents: r.withheldCents, status: r.status, attempts: r.attempts,
        lastError: r.lastError, nextAttemptAt: r.nextAttemptAt, createdAt: r.createdAt, paidAt: r.paidAt,
        driverName: [u?.firstName, u?.lastName].filter(Boolean).join(' ') || null,
        driverEmail: u?.email ?? null,
        needsAttention: r.status === 'failed' && r.attempts >= PAYOUT_MAX_ATTEMPTS,
      };
    });
  }

  /** Équipe XLCAB : relance immédiate d'un reversement non parti. */
  async adminRetry(adminId: string, payoutId: string, ctx: { ipAddress?: string; userAgent?: string }, now = new Date()) {
    const payout = (await this.prisma.payout.findUnique({ where: { id: payoutId } })) as PayoutRow | null;
    if (!payout) throw new NotFoundException('Reversement introuvable');
    if (!['pending', 'blocked', 'failed'].includes(payout.status)) throw new ConflictException('Ce reversement est déjà traité');
    const status = await this.attempt(payout, now);
    await this.audit.log({ userId: adminId, action: 'payout.retry', entity: 'Payout', entityId: payoutId, metadata: { status }, ...ctx });
    return { id: payoutId, status };
  }

  /** Paiement encaissé d'une course (celui de l'aller pour le retour d'un aller-retour de la bourse). */
  private async paymentOf(tripId: string, paidWithTripId: string | null) {
    const own = await this.prisma.payment.findFirst({ where: { tripId, status: 'succeeded' }, orderBy: { createdAt: 'desc' } });
    if (own || !paidWithTripId) return own;
    return this.prisma.payment.findFirst({ where: { tripId: paidWithTripId, status: 'succeeded' }, orderBy: { createdAt: 'desc' } });
  }
}

// ── API ───────────────────────────────────────────────────────────────

@Controller('api/v1/operators/me/payouts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class OperatorPayoutsController {
  constructor(private payouts: TripPayoutsService) {}

  @Get()
  mine(@Req() req: any) {
    return this.payouts.mine(req.user.sub);
  }
}

export class PayoutsQueryDto {
  @IsOptional()
  @IsIn(PAYOUT_STATUSES as unknown as string[], { message: 'Statut invalide' })
  status?: string;
}

/** Reversements vus par l'équipe XLCAB. 2FA comme tout l'admin. */
@Controller('api/v1/admin/payouts')
@UseGuards(JwtAuthGuard, RolesGuard, TwoFactorGuard)
@Roles('admin')
export class AdminPayoutsController {
  constructor(private payouts: TripPayoutsService) {}

  @Get()
  list(@Query() q: PayoutsQueryDto) {
    return this.payouts.adminList(q.status);
  }

  @Get('bonuses')
  bonuses() {
    return this.payouts.adminBonuses();
  }

  @Post('bonuses/:id/retry')
  @HttpCode(HttpStatus.OK)
  retryBonus(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.payouts.adminRetryBonus(req.user.sub, id, AuditService.context(req));
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  retry(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.payouts.adminRetry(req.user.sub, id, AuditService.context(req));
  }
}
