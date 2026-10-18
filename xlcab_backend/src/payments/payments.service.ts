import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe = require('stripe');
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DispatchService, SYSTEM_USER } from '../matching/dispatch.service';
import { TripStatus } from '../matching/matching.constants';
import { STRIPE_CLIENT } from './stripe.provider';
import { InvoicesService } from '../invoices/invoices.service';
import { LinesService } from '../operators/lines.service';

// Version d'API des clés éphémères attendue par les SDK mobiles Stripe
// (PaymentSheet). À aligner sur la version de flutter_stripe utilisée.
const DEFAULT_MOBILE_API_VERSION = '2024-06-20';

// Un événement Stripe peut être livré plusieurs fois : traité une seule.
const EVENT_DEDUP_SECONDS = 7 * 24 * 3600;

// Réservation passager non payée : annulée au bout de 30 min.
const DEFAULT_UNPAID_EXPIRY_MIN = 30;

/** Groupe Stripe qui relie le paiement d'une course à son reversement (Connect). */
export const transferGroupOf = (tripId: string) => `trip_${tripId}`;

/** Feuille de paiement d'une empreinte de carte (bourse) : rien n'est débité à ce stade. */
export interface AuthorizationSheetParams {
  offerId: string;
  paymentIntentClientSecret: string;
  customerId: string;
  ephemeralKeySecret: string;
  amountCents: number;
  currency: string;
}

export interface PaymentSheetParams {
  tripId: string;
  paymentIntentClientSecret: string;
  customerId: string;
  ephemeralKeySecret: string;
  amountCents: number;
  currency: string;
}

/**
 * Paiements Stripe (Partie 6). Choix : PRÉPAIEMENT à la réservation.
 * Une autorisation Stripe expire après 7 jours, or une course peut être
 * réservée bien plus tôt : on encaisse à la réservation et on rembourse
 * selon les CGV en cas d'annulation (Partie 13).
 *
 * Les montants viennent toujours du serveur (prix de la course), jamais
 * de l'app. Les courses d'entreprise ne passent pas par Stripe
 * (facturation mensuelle).
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private config: ConfigService,
    @Inject(STRIPE_CLIENT) private stripe: Stripe | null,
    private dispatch: DispatchService,
    private notifications: NotificationsService,
    private audit: AuditService,
    // Optionnel : certains tests construisent ce service sans facturation.
    @Optional() private invoices?: InvoicesService,
    @Optional() private lines?: LinesService,
  ) {}

  /** Stripe configuré : à vérifier avant de retenir quoi que ce soit pour un paiement. */
  available(): boolean {
    return this.stripe !== null;
  }

  // ── Paiement d'une course ───────────────────────────────────────────

  /**
   * Paramètres de la feuille de paiement Stripe (PaymentSheet) pour une
   * course en attente de paiement. Rappelable sans risque (reprise après
   * fermeture de l'app) : le même PaymentIntent est réutilisé.
   */
  async paymentSheet(userId: string, tripId: string): Promise<PaymentSheetParams> {
    const stripe = this.client();
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, passengerId: true, status: true, totalPriceCents: true, corporateId: true, source: true },
    });
    if (!trip || trip.passengerId !== userId) throw new NotFoundException('Trajet introuvable');
    if (trip.status !== TripStatus.AWAITING_PAYMENT || trip.corporateId) {
      throw new ConflictException('Cette course n’est pas en attente de paiement');
    }
    if (!trip.totalPriceCents || trip.totalPriceCents <= 0) throw new ConflictException('Montant de la course invalide');

    const customerId = await this.customerId(userId);
    const existing = await this.prisma.payment.findFirst({
      where: { tripId, status: 'requires_payment' },
      select: { stripePaymentIntentId: true },
    });

    let intent: Stripe.PaymentIntent;
    if (existing?.stripePaymentIntentId) {
      intent = await stripe.paymentIntents.retrieve(existing.stripePaymentIntentId);
    } else {
      intent = await stripe.paymentIntents.create(
        {
          amount: trip.totalPriceCents,
          currency: 'eur',
          customer: customerId,
          // Carte, Apple Pay, Google Pay… selon la configuration du compte.
          automatic_payment_methods: { enabled: true },
          description: `Course XLCAB ${tripId}`,
          metadata: { tripId, userId },
          // Ligne ou bourse (Stripe Connect) : le reversement à l'opérateur, après le
          // trajet, sera rattaché à ce paiement par ce groupe.
          ...(trip.source && trip.source !== 'instant' ? { transfer_group: transferGroupOf(tripId) } : {}),
        },
        // Idempotence : un double appel ne crée jamais deux paiements.
        { idempotencyKey: `trip-payment-${tripId}` },
      );
      await this.prisma.payment.create({
        data: {
          tripId,
          userId,
          stripePaymentIntentId: intent.id,
          amountCents: trip.totalPriceCents,
          currency: 'EUR',
          status: 'requires_payment',
        },
      });
    }

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: this.config.get<string>('STRIPE_MOBILE_API_VERSION') ?? DEFAULT_MOBILE_API_VERSION },
    );

    return {
      tripId,
      paymentIntentClientSecret: intent.client_secret!,
      customerId,
      ephemeralKeySecret: ephemeralKey.secret!,
      amountCents: trip.totalPriceCents,
      currency: 'EUR',
    };
  }

  /**
   * Appelé par l'app après la feuille de paiement : relit l'état chez
   * Stripe (le webhook peut arriver avec quelques secondes de retard).
   */
  async confirm(userId: string, tripId: string) {
    const stripe = this.client();
    const payment = await this.prisma.payment.findFirst({
      where: { tripId, userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!payment?.stripePaymentIntentId) throw new NotFoundException('Paiement introuvable');

    const intent = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
    if (intent.status === 'succeeded') await this.markPaid(intent);

    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, select: { status: true } });
    return { tripId, paymentStatus: intent.status, tripStatus: trip?.status ?? null };
  }

  // ── Empreinte de carte (bourse de transport) ────────────────────────
  //
  // Décision du 2026-10-13 : quand le client choisit une proposition, sa
  // carte est AUTORISÉE pour le montant sans être débitée. Le débit a lieu
  // quand l'opérateur confirme ; sinon l'autorisation est levée, sans aucun
  // mouvement d'argent. (Une autorisation tient 7 jours : l'opérateur a 2 h.)

  /** Feuille de paiement de l'empreinte, rappelable (même demande tant qu'elle est en cours). */
  async authorizationSheet(userId: string, offerId: string, amountCents: number): Promise<AuthorizationSheetParams> {
    const stripe = this.client();
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new ConflictException('Montant de la course invalide');
    const customerId = await this.customerId(userId);
    const existing = await this.prisma.payment.findFirst({ where: { offerId, userId, status: 'requires_payment' }, select: { stripePaymentIntentId: true } });

    let intent: Stripe.PaymentIntent;
    if (existing?.stripePaymentIntentId) {
      intent = await stripe.paymentIntents.retrieve(existing.stripePaymentIntentId);
    } else {
      // Une proposition peut être choisie, abandonnée puis choisie de nouveau :
      // chaque tentative a sa propre clé d'idempotence.
      const attempt = await this.prisma.payment.count({ where: { offerId } });
      intent = await stripe.paymentIntents.create(
        {
          amount: amountCents,
          currency: 'eur',
          customer: customerId,
          automatic_payment_methods: { enabled: true },
          // Empreinte : débit déclenché par le serveur, à la confirmation de l'opérateur.
          capture_method: 'manual',
          description: `Proposition XLCAB ${offerId}`,
          metadata: { offerId, userId },
        },
        { idempotencyKey: `offer-payment-${offerId}-${attempt}` },
      );
      await this.prisma.payment.create({
        data: { offerId, userId, stripePaymentIntentId: intent.id, amountCents, currency: 'EUR', status: 'requires_payment' },
      });
    }
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: this.config.get<string>('STRIPE_MOBILE_API_VERSION') ?? DEFAULT_MOBILE_API_VERSION },
    );
    return {
      offerId,
      paymentIntentClientSecret: intent.client_secret!,
      customerId,
      ephemeralKeySecret: ephemeralKey.secret!,
      amountCents,
      currency: 'EUR',
    };
  }

  /** Vrai si la carte du client est autorisée pour le montant exact de la proposition (relu chez Stripe). */
  async authorizationReady(offerId: string): Promise<boolean> {
    const payment = await this.prisma.payment.findFirst({ where: { offerId }, orderBy: { createdAt: 'desc' } });
    if (!payment?.stripePaymentIntentId) return false;
    if (payment.status === 'authorized') return true;
    if (payment.status !== 'requires_payment' || !this.stripe) return false;
    const intent = await this.stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
    if (intent.status !== 'requires_capture' || intent.amount_capturable !== payment.amountCents) return false;
    await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'authorized', method: intent.payment_method_types?.[0] ?? null } });
    return true;
  }

  /**
   * Débite l'empreinte (l'opérateur vient de confirmer). Refus de la banque
   * ou autorisation levée entre-temps : 409, rien n'est débité.
   */
  async captureAuthorization(offerId: string): Promise<void> {
    const stripe = this.client();
    const payment = await this.prisma.payment.findFirst({ where: { offerId }, orderBy: { createdAt: 'desc' } });
    if (!payment?.stripePaymentIntentId || payment.status !== 'authorized') {
      throw new ConflictException('Le paiement du client n’est plus autorisé');
    }
    let intent: Stripe.PaymentIntent;
    try {
      intent = await stripe.paymentIntents.capture(payment.stripePaymentIntentId, {}, { idempotencyKey: `offer-capture-${payment.id}` });
    } catch (err) {
      this.logger.error(`Débit de l'empreinte impossible (proposition ${offerId}) : ${(err as Error).message}`);
      await this.audit.log({ action: 'payment.capture_failed', entity: 'Payment', entityId: payment.id, metadata: { offerId } });
      throw new ConflictException('Le paiement du client n’est plus autorisé');
    }
    if (intent.status !== 'succeeded' || intent.amount_received !== payment.amountCents) {
      await this.audit.log({ action: 'payment.amount_mismatch', entity: 'Payment', entityId: payment.id, metadata: { received: intent.amount_received, expected: payment.amountCents } });
      throw new ConflictException('Le paiement du client n’est plus autorisé');
    }
    await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'succeeded' } });
  }

  /** Rattache le paiement d'une proposition à la course créée (l'aller ; le retour y renvoie par paidWithTripId). */
  async attachOfferPayment(offerId: string, tripId: string): Promise<void> {
    await this.prisma.payment.updateMany({ where: { offerId, status: 'succeeded' }, data: { tripId } });
  }

  /**
   * Lève l'empreinte d'une proposition qui n'aboutit pas (refus, délai,
   * demande annulée). Ne lève jamais d'erreur : un incident Stripe est
   * tracé, l'autorisation tombe de toute façon d'elle-même sous 7 jours.
   */
  async releaseAuthorization(offerId: string): Promise<void> {
    try {
      const pending = await this.prisma.payment.findMany({ where: { offerId, status: { in: ['requires_payment', 'authorized'] } } });
      for (const payment of pending) {
        if (payment.stripePaymentIntentId && this.stripe) await this.stripe.paymentIntents.cancel(payment.stripePaymentIntentId);
        await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'canceled' } });
      }
    } catch (err) {
      this.logger.error(`Levée de l'empreinte échouée (proposition ${offerId}) : ${(err as Error).message}`);
      await this.audit.log({ action: 'payment.release_failed', entity: 'TransportOffer', entityId: offerId });
    }
  }

  /** Empreinte débitée mais course non créée (incident) : remboursement intégral, tracé. */
  async refundCapturedOffer(offerId: string): Promise<void> {
    try {
      const payment = await this.prisma.payment.findFirst({ where: { offerId, status: 'succeeded' }, orderBy: { createdAt: 'desc' } });
      if (!payment?.stripePaymentIntentId || !this.stripe) return;
      const amount = payment.amountCents - payment.refundedCents;
      if (amount <= 0) return;
      await this.stripe.refunds.create(
        { payment_intent: payment.stripePaymentIntentId, amount, metadata: { offerId, reason: 'booking_not_created' } },
        { idempotencyKey: `offer-refund-${payment.id}` },
      );
      await this.prisma.payment.update({ where: { id: payment.id }, data: { refundedCents: payment.amountCents } });
    } catch (err) {
      this.logger.error(`Remboursement de la proposition ${offerId} échoué : ${(err as Error).message}`);
      await this.audit.log({ action: 'payment.refund_failed', entity: 'TransportOffer', entityId: offerId });
    }
  }

  // ── Webhook Stripe ──────────────────────────────────────────────────

  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    const stripe = this.client();
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret) throw new ServiceUnavailableException('Webhook Stripe non configuré');
    if (!rawBody || !signature) throw new BadRequestException('Signature Stripe manquante');

    let event: Stripe.Event;
    try {
      // Vérifie que la requête vient bien de Stripe (signature HMAC du
      // corps brut) : sans cela, n'importe qui pourrait "valider" un paiement.
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw new BadRequestException('Signature Stripe invalide');
    }

    const dedupKey = `stripe:event:${event.id}`;
    if ((await this.redis.set(dedupKey, '1', 'EX', EVENT_DEDUP_SECONDS, 'NX')) !== 'OK') {
      return { received: true, duplicate: true };
    }

    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.markPaid(event.data.object as Stripe.PaymentIntent);
          break;
        case 'payment_intent.payment_failed':
          await this.markFailed(event.data.object as Stripe.PaymentIntent);
          break;
        case 'charge.refunded':
          await this.onRefunded(event.data.object as Stripe.Charge);
          break;
        default:
          // Événements non utilisés : acquittés sans traitement.
          break;
      }
    } catch (err) {
      // Échec du traitement : on libère la déduplication pour que la
      // nouvelle tentative de Stripe soit traitée.
      await this.redis.del(dedupKey);
      throw err;
    }
    return { received: true };
  }

  /** Paiement encaissé : la course passe en recherche de chauffeur. Idempotent. */
  async markPaid(intent: Stripe.PaymentIntent) {
    const payment = await this.prisma.payment.findUnique({ where: { stripePaymentIntentId: intent.id } });
    if (!payment || payment.status === 'succeeded') return;
    // Contrôle de cohérence : le montant encaissé doit être celui attendu.
    if (intent.amount_received !== payment.amountCents) {
      this.logger.error(`Montant encaissé incohérent pour ${intent.id} (${intent.amount_received} ≠ ${payment.amountCents})`);
      await this.audit.log({ action: 'payment.amount_mismatch', entity: 'Payment', entityId: payment.id, metadata: { received: intent.amount_received, expected: payment.amountCents } });
      return;
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'succeeded', method: intent.payment_method_types?.[0] ?? null },
    });
    if (!payment.tripId) return;

    // Colis greffé sur une course passager : il suit cette course, pas de dispatch.
    const parcel = await this.prisma.parcelBooking.findUnique({ where: { tripId: payment.tripId }, select: { carrierTripId: true, onReturnLeg: true } });
    if (parcel?.carrierTripId) return this.attachPaidParcel(payment.tripId, parcel.carrierTripId, parcel.onReturnLeg, payment.userId);

    // Place sur une ligne régulière : confirmée auprès du chauffeur du départ, sans recherche.
    const paidTrip = await this.prisma.trip.findUnique({ where: { id: payment.tripId }, select: { source: true, lineDepartureId: true } });
    if (paidTrip?.source === 'line' && paidTrip.lineDepartureId) {
      return this.confirmPaidLineBooking(payment.tripId, paidTrip.lineDepartureId, payment.userId);
    }

    const updated = await this.prisma.trip.updateMany({
      where: { id: payment.tripId, status: TripStatus.AWAITING_PAYMENT },
      data: { status: TripStatus.PENDING },
    });
    if (updated.count === 0) {
      // Paiement arrivé sur une course déjà annulée (réservation expirée, ou
      // annulée pendant la saisie de la carte) : remboursement intégral.
      const trip = await this.prisma.trip.findUnique({ where: { id: payment.tripId }, select: { status: true } });
      if (trip?.status === TripStatus.CANCELLED) {
        await this.refundForCancellation(payment.tripId, 0);
      }
      return;
    }

    // Recherche de chauffeur au nom du système (Module 4) : immédiate, ou
    // différée à T − 3 h pour une course lointaine.
    let dispatchAt: Date | undefined;
    try {
      const res = await this.dispatch.startMatching(SYSTEM_USER, payment.tripId);
      dispatchAt = 'dispatchAt' in res ? res.dispatchAt : undefined;
    } catch (err) {
      this.logger.error(`Recherche de chauffeur impossible après paiement (trip ${payment.tripId}) : ${(err as Error).message}`);
    }
    if (payment.userId) {
      await this.notifications.notify(
        payment.userId, 'payment.succeeded', 'Paiement confirmé',
        dispatchAt ? 'Votre chauffeur vous sera attribué quelques heures avant le départ.' : 'Nous recherchons votre chauffeur.',
        { tripId: payment.tripId },
      );
    }
  }

  /**
   * Planificateur : une réservation non payée au bout de 30 min est
   * annulée (elle bloquait un créneau sans engagement). Avant d'annuler,
   * on relit Stripe : un paiement réussi dont le webhook est en retard
   * est validé au lieu d'être annulé.
   */
  async expireUnpaid(now = new Date()): Promise<number> {
    const expiryMin = Number(this.config.get<string>('UNPAID_BOOKING_EXPIRY_MIN')) || DEFAULT_UNPAID_EXPIRY_MIN;
    const stale = await this.prisma.trip.findMany({
      where: { status: TripStatus.AWAITING_PAYMENT, createdAt: { lt: new Date(now.getTime() - expiryMin * 60_000) } },
      select: { id: true, passengerId: true, lineDepartureId: true },
      take: 50,
    });

    let expired = 0;
    for (const trip of stale) {
      try {
        const payment = await this.prisma.payment.findFirst({ where: { tripId: trip.id }, orderBy: { createdAt: 'desc' } });
        if (payment?.stripePaymentIntentId && this.stripe) {
          const intent = await this.stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
          if (intent.status === 'succeeded') {
            await this.markPaid(intent);
            continue;
          }
          // Paiement en cours de validation (3-D Secure…) : on attend.
          if (intent.status === 'processing') continue;
        }
        const updated = await this.prisma.trip.updateMany({
          where: { id: trip.id, status: TripStatus.AWAITING_PAYMENT },
          data: { status: TripStatus.CANCELLED, cancelledAt: now, cancellationReason: 'Paiement non finalisé', cancellationFeeCents: 0 },
        });
        if (updated.count === 0) continue;
        await this.prisma.parcelBooking.updateMany({ where: { tripId: trip.id }, data: { status: 'cancelled' } });
        // Place sur une ligne : rendue à la vente.
        if (trip.lineDepartureId) await this.releaseLineSeats(trip.id, trip.lineDepartureId);
        await this.refundForCancellation(trip.id, 0); // annule la demande de paiement Stripe
        expired++;
        if (trip.passengerId) {
          await this.notifications.notify(
            trip.passengerId, 'booking.expired', 'Réservation expirée',
            'Le paiement n’a pas été finalisé : votre réservation a été annulée. Aucun montant n’a été débité.', { tripId: trip.id },
          );
        }
      } catch (err) {
        this.logger.error(`Expiration de réservation impossible (trip ${trip.id}) : ${(err as Error).message}`);
      }
    }
    return expired;
  }

  /**
   * Colis greffé payé : rattaché à sa course porteuse (statut "attached").
   * Si celle-ci est partie ou annulée entre-temps, le colis est annulé et
   * remboursé intégralement.
   */
  private async attachPaidParcel(tripId: string, carrierTripId: string, onReturnLeg: boolean, userId: string | null) {
    const carrier = await this.prisma.trip.findUnique({ where: { id: carrierTripId }, select: { status: true, driverId: true } });
    // Aller : la course ne doit pas être partie. Retour : il faut un
    // chauffeur engagé (le retour n'existe que par lui).
    const open =
      !!carrier &&
      (onReturnLeg
        ? !!carrier.driverId && ([TripStatus.ACCEPTED, TripStatus.STARTED] as string[]).includes(carrier.status)
        : ([TripStatus.PENDING, TripStatus.SEARCHING, TripStatus.NO_DRIVER, TripStatus.ACCEPTED] as string[]).includes(carrier.status));
    if (open) {
      const updated = await this.prisma.trip.updateMany({
        where: { id: tripId, status: TripStatus.AWAITING_PAYMENT },
        data: { status: TripStatus.ATTACHED },
      });
      if (updated.count > 0 && userId) {
        await this.notifications.notify(userId, 'parcel.confirmed', 'Envoi confirmé', 'Votre colis voyagera avec une navette XLCAB déjà prévue sur ce trajet.', { tripId });
      }
      // Réservation déjà annulée (expirée, annulée pendant le paiement) : remboursement.
      if (updated.count === 0) {
        const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, select: { status: true } });
        if (trip?.status === TripStatus.CANCELLED) await this.refundForCancellation(tripId, 0);
      }
      return;
    }
    const cancelled = await this.prisma.trip.updateMany({
      where: { id: tripId, status: { in: [TripStatus.AWAITING_PAYMENT, TripStatus.CANCELLED] } },
      data: { status: TripStatus.CANCELLED, cancelledAt: new Date(), cancellationReason: 'Navette porteuse indisponible', cancellationFeeCents: 0 },
    });
    await this.prisma.parcelBooking.updateMany({ where: { tripId }, data: { status: 'cancelled' } });
    if (cancelled.count > 0) await this.refundForCancellation(tripId, 0);
    if (userId) {
      await this.notifications.notify(userId, 'parcel.cancelled', 'Envoi de colis annulé', 'La navette prévue n’est plus disponible : vous êtes remboursé intégralement.', { tripId });
    }
  }

  /**
   * Réservation de ligne payée : la course devient « acceptée » par le
   * chauffeur qui assure le départ À CET INSTANT (titulaire, ou secours qui
   * l'a repris pendant le paiement). Départ parti ou annulé entre-temps :
   * réservation annulée et remboursée intégralement.
   */
  private async confirmPaidLineBooking(tripId: string, departureId: string, userId: string | null, now = new Date()) {
    const departure = await this.prisma.lineDeparture.findUnique({ where: { id: departureId } });
    const line = departure && (await this.prisma.recurringLine.findUnique({ where: { id: departure.lineId } }));

    if (!departure || !line || departure.rescueStatus === 'failed' || new Date(departure.departureAt) <= now) {
      const cancelled = await this.prisma.trip.updateMany({
        where: { id: tripId, status: { in: [TripStatus.AWAITING_PAYMENT, TripStatus.CANCELLED] } },
        data: { status: TripStatus.CANCELLED, cancelledAt: now, cancellationReason: 'Départ indisponible', cancellationFeeCents: 0 },
      });
      if (cancelled.count === 0) return;
      await this.releaseLineSeats(tripId, departureId);
      await this.refundForCancellation(tripId, 0);
      if (userId) {
        await this.notifications.notify(userId, 'line.booking_cancelled', 'Réservation annulée', 'Ce départ n’est plus disponible : vous êtes remboursé intégralement.', { tripId });
      }
      return;
    }

    // Chauffeur en cours de remplacement : la réservation attend le secours, comme les autres.
    const searching = departure.rescueStatus === 'searching';
    const driverId = searching ? null : departure.driverId ?? line.operatorId;
    const vehicleId = searching ? null : departure.vehicleId ?? line.vehicleId;
    const updated = await this.prisma.trip.updateMany({
      where: { id: tripId, status: TripStatus.AWAITING_PAYMENT },
      data: { status: TripStatus.ACCEPTED, acceptedAt: now, driverId, vehicleId },
    });
    if (updated.count === 0) {
      // Réservation expirée ou annulée pendant la saisie de la carte : remboursement.
      const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, select: { status: true } });
      if (trip?.status === TripStatus.CANCELLED) await this.refundForCancellation(tripId, 0);
      return;
    }
    const isParcel = (await this.prisma.trip.findUnique({ where: { id: tripId }, select: { type: true } }))?.type === 'parcel';
    if (userId) {
      await (isParcel
        ? this.notifications.notify(userId, 'line.parcel_booked', 'Colis confirmé', 'Votre colis voyage sur la ligne. Présentez le QR au chauffeur au point de rendez-vous.', { tripId })
        : this.notifications.notify(userId, 'line.booked', 'Réservation confirmée', 'Votre place sur la ligne est réservée.', { tripId }));
    }
    if (driverId) {
      await this.notifications.notify(driverId, 'line.new_booking', 'Nouvelle réservation', 'Un passager a réservé sur votre ligne.', { departureId });
    }
    // Seuil de départ : ce paiement l'a peut-être atteint (« Départ confirmé »).
    await this.lines?.guaranteeIfReached(departureId, now);
  }

  /** Rend à la vente les places (et sièges numérotés) d'une réservation de ligne abandonnée. */
  private async releaseLineSeats(tripId: string, departureId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, select: { type: true } });
    if (trip?.type === 'parcel') {
      await this.prisma.parcelBooking.updateMany({ where: { tripId, status: 'pending' }, data: { status: 'cancelled' } });
      return this.lines?.releaseParcelSlot(departureId);
    }
    const booking = await this.prisma.passengerBooking.findUnique({ where: { tripId }, select: { seats: true } });
    await this.lines?.releaseSeats(departureId, booking?.seats ?? 0, tripId);
  }

  private async markFailed(intent: Stripe.PaymentIntent) {
    const payment = await this.prisma.payment.findUnique({ where: { stripePaymentIntentId: intent.id } });
    if (!payment || payment.status !== 'requires_payment') return;
    // Le passager peut réessayer avec un autre moyen de paiement (même
    // PaymentIntent) : le paiement reste "requires_payment".
    if (payment.userId) {
      await this.notifications.notify(payment.userId, 'payment.failed', 'Paiement refusé', 'Votre paiement n’a pas abouti. Essayez un autre moyen de paiement.', { tripId: payment.tripId });
    }
  }

  private async onRefunded(charge: Stripe.Charge) {
    const intentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
    if (!intentId) return;
    const payment = await this.prisma.payment.findUnique({ where: { stripePaymentIntentId: intentId } });
    if (!payment) return;
    // Source de vérité : le total remboursé selon Stripe.
    await this.prisma.payment.update({ where: { id: payment.id }, data: { refundedCents: charge.amount_refunded } });
  }

  // ── Remboursements ──────────────────────────────────────────────────

  /**
   * Annulation d'une course (module Trips) : remboursement du montant
   * payé moins les frais des CGV. Un incident Stripe ne bloque jamais
   * l'annulation : il est tracé pour reprise manuelle par l'équipe.
   */
  async refundForCancellation(tripId: string, feeCents: number): Promise<{ refundedCents: number; failed?: boolean }> {
    // Tout est dans le try : l'annulation est déjà enregistrée, une erreur
    // ici (base ou Stripe) ne doit jamais la faire passer pour un échec.
    let paymentId: string | undefined;
    try {
      const { payment, shareCents } = await this.paymentOf(tripId);
      if (!payment?.stripePaymentIntentId || !this.stripe) return { refundedCents: 0 };
      paymentId = payment.id;

      if (payment.status === 'requires_payment') {
        // Jamais payé : on annule simplement la demande de paiement.
        await this.stripe.paymentIntents.cancel(payment.stripePaymentIntentId);
        await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'canceled' } });
        return { refundedCents: 0 };
      }
      if (payment.status !== 'succeeded') return { refundedCents: 0 };

      // Aller-retour payé en une fois : on ne rembourse que la part de CETTE course.
      const remaining = payment.amountCents - payment.refundedCents;
      const amount = shareCents === null ? remaining - feeCents : Math.min(shareCents - feeCents, remaining);
      if (amount <= 0) return { refundedCents: 0 };
      await this.stripe.refunds.create(
        { payment_intent: payment.stripePaymentIntentId, amount, reason: 'requested_by_customer', metadata: { tripId, feeCents: String(feeCents) } },
        { idempotencyKey: `cancel-refund-${tripId}` },
      );
      await this.prisma.payment.update({ where: { id: payment.id }, data: { refundedCents: payment.refundedCents + amount } });
      return { refundedCents: amount };
    } catch (err) {
      this.logger.error(`Remboursement d'annulation échoué (trip ${tripId}) : ${(err as Error).message}`);
      await this.audit.log({ action: 'payment.refund_failed', entity: 'Payment', entityId: paymentId, metadata: { tripId, feeCents } });
      return { refundedCents: 0, failed: true };
    }
  }

  /**
   * Paiement d'une course. Pour un aller-retour de la bourse, un seul
   * paiement couvre les deux courses : `shareCents` est alors la part de
   * celle-ci (son prix), null quand le paiement ne couvre qu'elle.
   */
  private async paymentOf(tripId: string) {
    const own = await this.prisma.payment.findFirst({ where: { tripId }, orderBy: { createdAt: 'desc' } });
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, select: { totalPriceCents: true, paidWithTripId: true } });
    if (own) {
      const shared = own.offerId ? await this.prisma.trip.count({ where: { paidWithTripId: tripId } }) : 0;
      return { payment: own, shareCents: shared > 0 ? trip?.totalPriceCents ?? 0 : null };
    }
    if (!trip?.paidWithTripId) return { payment: null, shareCents: null };
    const carrier = await this.prisma.payment.findFirst({ where: { tripId: trip.paidWithTripId }, orderBy: { createdAt: 'desc' } });
    return { payment: carrier, shareCents: trip.totalPriceCents ?? 0 };
  }

  /** Remboursement manuel par l'équipe XLCAB (geste commercial, litige). */
  async adminRefund(adminId: string, paymentId: string, amountCents: number | undefined, reason: string, ctx: { ipAddress?: string; userAgent?: string }) {
    const stripe = this.client();
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment?.stripePaymentIntentId) throw new NotFoundException('Paiement introuvable');
    if (payment.status !== 'succeeded') throw new ConflictException('Seul un paiement encaissé peut être remboursé');

    const max = payment.amountCents - payment.refundedCents;
    const amount = amountCents ?? max;
    if (amount <= 0 || amount > max) {
      throw new BadRequestException(`Montant à rembourser entre 1 et ${max} centimes`);
    }
    await stripe.refunds.create(
      { payment_intent: payment.stripePaymentIntentId, amount, metadata: { adminId, reason } },
      { idempotencyKey: `admin-refund-${paymentId}-${payment.refundedCents}-${amount}` },
    );
    await this.prisma.payment.update({ where: { id: paymentId }, data: { refundedCents: payment.refundedCents + amount } });
    await this.audit.log({ userId: adminId, action: 'payment.refund', entity: 'Payment', entityId: paymentId, metadata: { amount, reason }, ...ctx });
    // Remboursement d'une course déjà facturée : avoir.
    if (payment.tripId) await this.invoices?.issueCreditNote(payment.tripId, amount, reason);
    if (payment.userId) {
      await this.notifications.notify(payment.userId, 'payment.refunded', 'Remboursement effectué', `Un remboursement de ${(amount / 100).toFixed(2).replace('.', ',')} € a été émis.`, { paymentId });
    }
    return { paymentId, refundedCents: payment.refundedCents + amount };
  }

  // ── Moyens de paiement enregistrés ──────────────────────────────────

  async listMethods(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true } });
    if (!user?.stripeCustomerId) return [];
    const methods = await this.client().paymentMethods.list({ customer: user.stripeCustomerId, type: 'card' });
    // Jamais de numéro complet : marque, 4 derniers chiffres, expiration.
    return methods.data.map((m) => ({
      id: m.id,
      brand: m.card?.brand ?? null,
      last4: m.card?.last4 ?? null,
      expMonth: m.card?.exp_month ?? null,
      expYear: m.card?.exp_year ?? null,
    }));
  }

  /** Ajout d'une carte (SetupIntent, saisie dans la feuille Stripe). */
  async addMethod(userId: string) {
    const stripe = this.client();
    const customerId = await this.customerId(userId);
    const setup = await stripe.setupIntents.create({ customer: customerId, automatic_payment_methods: { enabled: true } });
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: this.config.get<string>('STRIPE_MOBILE_API_VERSION') ?? DEFAULT_MOBILE_API_VERSION },
    );
    return { setupIntentClientSecret: setup.client_secret!, customerId, ephemeralKeySecret: ephemeralKey.secret! };
  }

  async deleteMethod(userId: string, paymentMethodId: string) {
    const stripe = this.client();
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true } });
    let method: Stripe.PaymentMethod;
    try {
      method = await stripe.paymentMethods.retrieve(paymentMethodId);
    } catch {
      throw new NotFoundException('Moyen de paiement introuvable');
    }
    // Ownership : on ne détache que la carte de SON compte Stripe.
    const owner = typeof method.customer === 'string' ? method.customer : method.customer?.id;
    if (!user?.stripeCustomerId || owner !== user.stripeCustomerId) throw new NotFoundException('Moyen de paiement introuvable');
    await stripe.paymentMethods.detach(paymentMethodId);
    return { deleted: true };
  }

  /** Effacement RGPD : client Stripe et cartes enregistrées supprimés. N'échoue jamais. */
  async deleteCustomer(customerId: string): Promise<void> {
    if (!this.stripe) return;
    try {
      await this.stripe.customers.del(customerId);
    } catch (err) {
      this.logger.error(`Suppression du client Stripe ${customerId} échouée : ${(err as Error).message}`);
      await this.audit.log({ action: 'payment.customer_delete_failed', entity: 'User', metadata: { customerId } });
    }
  }

  // ── Utilitaires ─────────────────────────────────────────────────────

  private client(): Stripe {
    if (!this.stripe) throw new ServiceUnavailableException('Paiement momentanément indisponible');
    return this.stripe;
  }

  /** Client Stripe de l'utilisateur, créé au premier paiement. */
  private async customerId(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, stripeCustomerId: true, deletedAt: true } });
    if (!user || user.deletedAt) throw new UnauthorizedException('Compte introuvable ou désactivé');
    if (user.stripeCustomerId) return user.stripeCustomerId;
    const customer = await this.client().customers.create(
      { email: user.email, metadata: { userId } },
      { idempotencyKey: `customer-${userId}` },
    );
    await this.prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } });
    return customer.id;
  }
}
