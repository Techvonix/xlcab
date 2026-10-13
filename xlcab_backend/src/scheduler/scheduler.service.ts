import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { DispatchService } from '../matching/dispatch.service';
import { PaymentsService } from '../payments/payments.service';
import { ParcelsService } from '../parcels/parcels.service';
import { InvoicesService } from '../invoices/invoices.service';
import { ComplianceReport, ComplianceService } from '../compliance/compliance.service';
import { LinesService } from '../operators/lines.service';
import { RescueService } from '../line-bookings/rescue.service';
import { MarketService } from '../market/market.service';
import { TripPayoutsService } from '../payouts/trip-payouts';

export const SCHEDULER_TICK_MS = 60_000;
// Verrou d'un tour : si l'API tourne un jour sur plusieurs instances, une
// seule exécute le tour de la minute. Expire avant le tour suivant.
const LOCK_KEY = 'scheduler:tick:lock';
const LOCK_TTL_SECONDS = 50;

export interface TickReport {
  expiredBookings: number;
  dispatchStarted: number;
  dispatchRetried: number;
  strandedParcels: number;
  monthlyInvoices: number;
  /** Contrôles quotidiens (documents, géolocalisation, comptes inactifs), si exécutés à ce tour. */
  compliance: ComplianceReport | null;
  /** Lignes régulières dont les départs ont été régénérés (passe quotidienne), sinon null. */
  linesSynced: number | null;
  /** Protocole d'annulation des lignes (secours, contrôles avant départ, pénalités). */
  rescue: Awaited<ReturnType<RescueService['tick']>> | null;
  /** Bourse : propositions et demandes expirées. */
  market: Awaited<ReturnType<MarketService['tick']>> | null;
  /** Reversements aux opérateurs repris à ce tour (virés, en attente de compte, en échec). */
  payouts: Awaited<ReturnType<TripPayoutsService['tick']>> | null;
}

/**
 * Tâches planifiées, une fois par minute :
 * - annulation des réservations non payées depuis 30 min ;
 * - recherche de chauffeur des courses programmées à T − 3 h, et relance
 *   des courses restées sans chauffeur ;
 * - colis greffés dont la course porteuse n'est jamais partie (remboursés) ;
 * - factures mensuelles des entreprises (mois écoulé), une fois par mois ;
 * - contrôles de conformité (documents chauffeur, géolocalisation 30 j,
 *   comptes inactifs 3 ans), une fois par jour ;
 * - départs des lignes régulières sur 30 jours glissants, une fois par jour ;
 * - protocole d'annulation des lignes (secours, contrôles T−75/60/45 min) ;
 * - bourse : propositions et demandes arrivées à échéance ;
 * - reversements aux opérateurs à reprendre (compte de versement ouvert depuis, incident Stripe).
 *
 * Simple setInterval (pas de dépendance supplémentaire) : suffisant pour
 * une instance. Désactivable avec SCHEDULER_ENABLED=false.
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private redis: RedisService,
    private dispatch: DispatchService,
    private payments: PaymentsService,
    private config: ConfigService,
    private parcels: ParcelsService,
    @Optional() private invoices?: InvoicesService,
    @Optional() private compliance?: ComplianceService,
    @Optional() private lines?: LinesService,
    @Optional() private rescue?: RescueService,
    @Optional() private market?: MarketService,
    @Optional() private payouts?: TripPayoutsService,
  ) {}

  onApplicationBootstrap() {
    if (this.config.get<string>('SCHEDULER_ENABLED') === 'false') return;
    this.timer = setInterval(() => {
      this.tick().catch((err: Error) => this.logger.error(`Tour du planificateur en échec : ${err.message}`));
    }, SCHEDULER_TICK_MS);
    // N'empêche pas l'arrêt du processus (ni la fin des tests).
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Un tour. null si une autre instance l'exécute déjà. */
  async tick(now = new Date()): Promise<TickReport | null> {
    if ((await this.redis.set(LOCK_KEY, '1', 'EX', LOCK_TTL_SECONDS, 'NX')) !== 'OK') return null;

    // Les deux tâches sont indépendantes : l'échec de l'une n'empêche pas l'autre.
    let expiredBookings = 0;
    try {
      expiredBookings = await this.payments.expireUnpaid(now);
    } catch (err) {
      this.logger.error(`Expiration des réservations impayées en échec : ${(err as Error).message}`);
    }

    let dispatch = { started: 0, retried: 0 };
    try {
      dispatch = await this.dispatch.dispatchDue(now);
    } catch (err) {
      this.logger.error(`Recherches planifiées en échec : ${(err as Error).message}`);
    }

    let strandedParcels = 0;
    try {
      strandedParcels = await this.parcels.releaseStranded(now);
    } catch (err) {
      this.logger.error(`Colis sans navette : traitement en échec : ${(err as Error).message}`);
    }

    // Factures mensuelles : un seul passage par mois (clé Redis), dès le 1er.
    let monthlyInvoices = 0;
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    if (this.invoices && (await this.redis.set(`invoices:monthly:${month}`, '1', 'EX', 40 * 24 * 3600, 'NX')) === 'OK') {
      try {
        monthlyInvoices = await this.invoices.runMonthly(now);
      } catch (err) {
        await this.redis.del(`invoices:monthly:${month}`); // nouvel essai au tour suivant
        this.logger.error(`Factures mensuelles en échec : ${(err as Error).message}`);
      }
    }

    // Contrôles de conformité : une passe par jour (clé Redis datée).
    let compliance: ComplianceReport | null = null;
    const today = now.toISOString().slice(0, 10);
    if (this.compliance && (await this.redis.set(`compliance:daily:${today}`, '1', 'EX', 2 * 24 * 3600, 'NX')) === 'OK') {
      try {
        compliance = await this.compliance.runDaily(now);
      } catch (err) {
        await this.redis.del(`compliance:daily:${today}`);
        this.logger.error(`Contrôles quotidiens en échec : ${(err as Error).message}`);
      }
    }

    // Protocole d'annulation des lignes : secours, contrôles avant départ, pénalités.
    let rescue: TickReport['rescue'] = null;
    if (this.rescue) {
      try {
        rescue = await this.rescue.tick(now);
      } catch (err) {
        this.logger.error(`Protocole de secours des lignes en échec : ${(err as Error).message}`);
      }
    }

    // Bourse : propositions et demandes arrivées à échéance.
    let market: TickReport['market'] = null;
    if (this.market) {
      try {
        market = await this.market.tick(now);
      } catch (err) {
        this.logger.error(`Échéances de la bourse en échec : ${(err as Error).message}`);
      }
    }

    // Reversements aux opérateurs : reprises.
    let payouts: TickReport['payouts'] = null;
    if (this.payouts) {
      try {
        payouts = await this.payouts.tick(now);
      } catch (err) {
        this.logger.error(`Reversements aux opérateurs en échec : ${(err as Error).message}`);
      }
    }

    // Lignes régulières : départs générés sur 30 jours glissants, une fois par jour.
    let linesSynced: number | null = null;
    if (this.lines && (await this.redis.set(`lines:daily:${today}`, '1', 'EX', 2 * 24 * 3600, 'NX')) === 'OK') {
      try {
        linesSynced = await this.lines.syncAll(now);
      } catch (err) {
        await this.redis.del(`lines:daily:${today}`);
        this.logger.error(`Génération des départs de lignes en échec : ${(err as Error).message}`);
      }
    }

    return {
      expiredBookings, dispatchStarted: dispatch.started, dispatchRetried: dispatch.retried, strandedParcels, monthlyInvoices, compliance, linesSynced, rescue, market, payouts,
    };
  }
}
