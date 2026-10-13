import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe = require('stripe');
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { STRIPE_CLIENT } from '../payments/stripe.provider';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { linePaymentMode } from './payment-mode';

// Compte de versement des opérateurs (Stripe Connect, étape 1).
//
// Décisions du porteur de projet (2026-10-13) : le passager paie à la
// réservation, la part de l'opérateur lui est reversée après le trajet ;
// lignes et bourse d'abord ; un opérateur sans compte de versement validé
// ne peut ni ouvrir un départ à la réservation ni proposer sur la bourse.
//
// Le compte est un compte Stripe « Express » : c'est Stripe qui recueille
// l'identité et l'IBAN de l'opérateur sur ses propres pages. XLCAB ne voit
// ni pièce d'identité ni coordonnées bancaires, seulement l'état du compte.

const LINKS_MAX_PER_HOUR = 10;
const EVENT_DEDUP_SECONDS = 7 * 24 * 3600;

/** Où en est le compte de versement. */
export type PayoutState =
  | 'none' // jamais commencé
  | 'incomplete' // informations à fournir à Stripe
  | 'pending' // dossier envoyé, vérification par Stripe en cours
  | 'ready'; // versements possibles

export interface PayoutAccountView {
  /** Faux tant que le paiement en ligne des lignes et de la bourse n'est pas activé. */
  required: boolean;
  state: PayoutState;
  ready: boolean;
  /** Nombre d'informations que Stripe attend encore (jamais leur détail). */
  requirementsDue: number;
}

type StoredAccount = {
  userId: string;
  stripeAccountId: string;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  transfersActive: boolean;
  requirementsDue: number;
};

const isReady = (a: Pick<StoredAccount, 'payoutsEnabled' | 'transfersActive'> | null) => !!a && a.payoutsEnabled && a.transfersActive;

function stateOf(a: StoredAccount | null): PayoutState {
  if (!a) return 'none';
  if (isReady(a)) return 'ready';
  return a.detailsSubmitted && a.requirementsDue === 0 ? 'pending' : 'incomplete';
}

@Injectable()
export class PayoutAccountsService {
  private readonly logger = new Logger(PayoutAccountsService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private config: ConfigService,
    @Inject(STRIPE_CLIENT) private stripe: Stripe | null,
    private notifications: NotificationsService,
    private audit: AuditService,
  ) {}

  /** État du compte de versement. Relu chez Stripe tant qu'il n'est pas prêt (retour de l'ouverture). */
  async view(userId: string): Promise<PayoutAccountView> {
    let account = (await this.prisma.payoutAccount.findUnique({ where: { userId } })) as StoredAccount | null;
    if (account && !isReady(account) && this.stripe) {
      const accountId = account.stripeAccountId;
      try {
        account = (await this.sync(await this.stripe.accounts.retrieve(accountId))) ?? account;
      } catch (err) {
        // Stripe injoignable : on répond avec le dernier état connu.
        this.logger.warn(`Compte de versement ${accountId} non relu : ${(err as Error).message}`);
      }
    }
    return {
      required: linePaymentMode() === 'connect',
      state: stateOf(account),
      ready: isReady(account),
      requirementsDue: account?.requirementsDue ?? 0,
    };
  }

  /**
   * Lien vers les pages de Stripe où l'opérateur ouvre (ou complète) son
   * compte de versement. Le lien est à usage unique et expire en quelques
   * minutes : l'app en redemande un à chaque fois.
   */
  async onboardingLink(userId: string, ctx: { ipAddress?: string; userAgent?: string } = {}) {
    const stripe = this.client();
    await this.rateLimit(userId);

    const [user, driver, operator] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, deletedAt: true } }),
      this.prisma.driverProfile.findUnique({ where: { id: userId } }),
      this.prisma.operatorProfile.findUnique({ where: { id: userId } }),
    ]);
    if (!user || user.deletedAt) throw new ForbiddenException('Compte introuvable ou désactivé');
    if (!driver?.approvedAt) {
      throw new ForbiddenException('Votre compte chauffeur doit être validé par XLCAB avant d’ouvrir un compte de versement');
    }
    if (!operator) throw new ConflictException('Complétez d’abord votre profil opérateur');

    let account = (await this.prisma.payoutAccount.findUnique({ where: { userId } })) as StoredAccount | null;
    if (!account) {
      const created = await stripe.accounts.create(
        {
          type: 'express',
          country: this.config.get<string>('STRIPE_CONNECT_COUNTRY') || 'FR',
          email: user.email,
          // Le compte ne fait que RECEVOIR des reversements : il n'encaisse aucune carte.
          capabilities: { transfers: { requested: true } },
          metadata: { userId },
        },
        // Deux demandes simultanées n'ouvrent jamais deux comptes.
        { idempotencyKey: `payout-account-${userId}` },
      );
      account = (await this.prisma.payoutAccount.upsert({
        where: { userId },
        create: { userId, stripeAccountId: created.id },
        update: {},
      })) as StoredAccount;
      await this.audit.log({ userId, action: 'payout.account.create', entity: 'PayoutAccount', entityId: userId, ...ctx });
    }

    const base = (this.config.get<string>('PUBLIC_API_URL') || 'http://localhost:3000').replace(/\/+$/, '');
    const link = await stripe.accountLinks.create({
      account: account.stripeAccountId,
      type: 'account_onboarding',
      return_url: `${base}/versements/retour`,
      // Lien expiré ou déjà utilisé : Stripe renvoie ici, l'opérateur repart de l'app.
      refresh_url: `${base}/versements/reprise`,
    });
    return { url: link.url, expiresAt: new Date(link.expires_at * 1000) };
  }

  /** Lien vers l'espace Stripe de l'opérateur (versements reçus, IBAN). */
  async dashboardLink(userId: string) {
    const stripe = this.client();
    await this.rateLimit(userId);
    const account = (await this.prisma.payoutAccount.findUnique({ where: { userId } })) as StoredAccount | null;
    if (!account?.detailsSubmitted) throw new ConflictException('Terminez d’abord l’ouverture de votre compte de versement');
    const link = await stripe.accounts.createLoginLink(account.stripeAccountId);
    return { url: link.url };
  }

  /**
   * Refuse l'action si le paiement en ligne est activé et que l'opérateur
   * ne peut pas être réglé. Sans effet en mode « deferred » (tests).
   */
  async assertReady(userId: string) {
    if (linePaymentMode() !== 'connect') return;
    const account = await this.prisma.payoutAccount.findUnique({ where: { userId } });
    if (!isReady(account as StoredAccount | null)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PAYOUT_ACCOUNT_REQUIRED',
        message: 'Ouvrez votre compte de versement avant de proposer vos services',
      });
    }
  }

  /** Compte prêt à recevoir un reversement, sinon null (étapes suivantes : reversement après le trajet). */
  async readyAccountId(userId: string): Promise<string | null> {
    const account = (await this.prisma.payoutAccount.findUnique({ where: { userId } })) as StoredAccount | null;
    return isReady(account) ? account!.stripeAccountId : null;
  }

  // ── Webhook Stripe Connect ──────────────────────────────────────────

  /**
   * Événements des comptes des opérateurs. Stripe les envoie à un point
   * d'entrée distinct de celui des paiements, avec son propre secret
   * (STRIPE_CONNECT_WEBHOOK_SECRET).
   */
  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    const stripe = this.client();
    const secret = this.config.get<string>('STRIPE_CONNECT_WEBHOOK_SECRET');
    if (!secret) throw new ServiceUnavailableException('Webhook Stripe non configuré');
    if (!rawBody || !signature) throw new BadRequestException('Signature Stripe manquante');

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw new BadRequestException('Signature Stripe invalide');
    }

    const dedupKey = `stripe:event:${event.id}`;
    if ((await this.redis.set(dedupKey, '1', 'EX', EVENT_DEDUP_SECONDS, 'NX')) !== 'OK') {
      return { received: true, duplicate: true };
    }
    try {
      if (event.type === 'account.updated') await this.sync(event.data.object as Stripe.Account);
    } catch (err) {
      // Traitement échoué : la nouvelle tentative de Stripe sera traitée.
      await this.redis.del(dedupKey);
      throw err;
    }
    return { received: true };
  }

  /** Recopie l'état d'un compte Stripe. Un compte inconnu de XLCAB est ignoré. */
  private async sync(remote: Stripe.Account): Promise<StoredAccount | null> {
    const known = (await this.prisma.payoutAccount.findUnique({ where: { stripeAccountId: remote.id } })) as StoredAccount | null;
    if (!known) return null;
    const next = {
      detailsSubmitted: remote.details_submitted === true,
      payoutsEnabled: remote.payouts_enabled === true,
      transfersActive: remote.capabilities?.transfers === 'active',
      requirementsDue: remote.requirements?.currently_due?.length ?? 0,
      disabledReason: remote.requirements?.disabled_reason ?? null,
    };
    const updated = (await this.prisma.payoutAccount.update({ where: { userId: known.userId }, data: next })) as StoredAccount;

    if (isReady(updated) && !isReady(known)) {
      await this.audit.log({ userId: known.userId, action: 'payout.account.ready', entity: 'PayoutAccount', entityId: known.userId });
      await this.notifications.notify(
        known.userId, 'payout.account_ready', 'Compte de versement validé',
        'Vous pouvez ouvrir vos départs à la réservation et répondre aux demandes de la bourse.',
      );
    } else if (!isReady(updated) && isReady(known)) {
      // Stripe a suspendu les versements (pièce expirée, IBAN refusé…).
      await this.audit.log({ userId: known.userId, action: 'payout.account.suspended', entity: 'PayoutAccount', entityId: known.userId });
      await this.notifications.notify(
        known.userId, 'payout.account_action_required', 'Compte de versement à compléter',
        'Stripe a besoin d’informations supplémentaires pour continuer à vous verser vos revenus.',
      );
    }
    return updated;
  }

  // ── Utilitaires ─────────────────────────────────────────────────────

  private client(): Stripe {
    if (!this.stripe) throw new ServiceUnavailableException('Paiement momentanément indisponible');
    return this.stripe;
  }

  private async rateLimit(userId: string) {
    const key = `payout:link:rate:${userId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 3600);
    if (count > LINKS_MAX_PER_HOUR) throw new HttpException('Trop de demandes — réessayez plus tard', HttpStatus.TOO_MANY_REQUESTS);
  }
}

// ── API opérateur ─────────────────────────────────────────────────────

@Controller('api/v1/operators/me/payout-account')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class PayoutAccountController {
  constructor(private accounts: PayoutAccountsService) {}

  @Get()
  view(@Req() req: any) {
    return this.accounts.view(req.user.sub);
  }

  @Post('onboarding-link')
  @HttpCode(HttpStatus.OK)
  onboardingLink(@Req() req: any) {
    return this.accounts.onboardingLink(req.user.sub, AuditService.context(req));
  }

  @Post('dashboard-link')
  @HttpCode(HttpStatus.OK)
  dashboardLink(@Req() req: any) {
    return this.accounts.dashboardLink(req.user.sub);
  }
}

/** POST /api/v1/webhooks/stripe-connect : authentifié par la signature Stripe (corps brut). */
@Controller('api/v1/webhooks')
export class StripeConnectWebhookController {
  constructor(private accounts: PayoutAccountsService) {}

  @Post('stripe-connect')
  @HttpCode(HttpStatus.OK)
  stripeConnect(@Req() req: any, @Headers('stripe-signature') signature?: string) {
    return this.accounts.handleWebhook(req.rawBody, signature);
  }
}

// ── Pages de retour de Stripe (ouvertes dans le navigateur du téléphone) ──

const RETURN_TEXTS = {
  fr: {
    retour: ['Informations transmises à Stripe', 'Vous pouvez fermer cette page et revenir dans l’application XLCAB Driver : l’état de votre compte de versement s’y met à jour.'],
    reprise: ['Ce lien a expiré', 'Revenez dans l’application XLCAB Driver et touchez de nouveau « Compte de versement » pour reprendre où vous en étiez.'],
  },
  en: {
    retour: ['Details sent to Stripe', 'You can close this page and go back to the XLCAB Driver app: your payout account status updates there.'],
    reprise: ['This link has expired', 'Go back to the XLCAB Driver app and tap “Payout account” again to pick up where you left off.'],
  },
} as const;

/** Page statique, sans script (CSP de Helmet) ni donnée personnelle. */
export function renderPayoutReturnPage(kind: 'retour' | 'reprise', lang: 'fr' | 'en'): string {
  const [title, body] = RETURN_TEXTS[lang][kind];
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>XLCAB — ${title}</title>
<link rel="stylesheet" href="/suivi/style.css">
</head>
<body>
<main>
<h1>${title}</h1>
<p>${body}</p>
</main>
</body>
</html>`;
}

@Controller('versements')
export class PayoutReturnController {
  @Get('retour')
  retour(@Query('lang') lang: string | undefined, @Req() req: any, @Res() res: any) {
    this.send('retour', lang, req, res);
  }

  @Get('reprise')
  reprise(@Query('lang') lang: string | undefined, @Req() req: any, @Res() res: any) {
    this.send('reprise', lang, req, res);
  }

  private send(kind: 'retour' | 'reprise', lang: string | undefined, req: any, res: any) {
    const accept = String(req.headers?.['accept-language'] ?? '').toLowerCase();
    const chosen: 'fr' | 'en' = lang === 'en' || lang === 'fr' ? lang : accept.startsWith('fr') || accept === '' ? 'fr' : 'en';
    res
      .status(200)
      .set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' })
      .send(renderPayoutReturnPage(kind, chosen));
  }
}
