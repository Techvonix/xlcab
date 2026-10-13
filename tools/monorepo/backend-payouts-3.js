// Stripe Connect, étape 3 : bourse — empreinte de carte au choix du client,
// débit à la confirmation de l'opérateur, levée sinon.
const fs = require('fs');
const R = 'C:/xlcab/xlcab_backend/';
function edit(file, steps) {
  let s = fs.readFileSync(R + file, 'utf8');
  for (const [from, to] of steps) {
    if (!s.includes(from)) throw new Error(`${file} : motif introuvable : ${from}`);
    s = s.replace(from, () => to);
  }
  fs.writeFileSync(R + file, s);
}

// ── Schéma ──────────────────────────────────────────────────────────────
edit('prisma/schema.prisma', [
  [
    '  stripePaymentIntentId String?  @unique\n  amountCents           Int\n  currency              String   @default("EUR")\n  status                String // requires_payment|succeeded|failed|canceled',
    '  // Bourse : empreinte de carte prise au choix d\'une proposition, avant que\n  // les courses existent ; tripId = l\'aller une fois l\'opérateur confirmé.\n  offerId               String?\n  stripePaymentIntentId String?  @unique\n  amountCents           Int\n  currency              String   @default("EUR")\n  status                String // requires_payment|authorized|succeeded|failed|canceled',
  ],
  ['  @@index([tripId])\n}\n\n// ── Module 10', '  @@index([tripId])\n  @@index([offerId])\n}\n\n// ── Module 10'],
  [
    'model Trip {\n  id                   String    @id @default(uuid())',
    'model Trip {\n  id                   String    @id @default(uuid())\n  // Retour d\'un aller-retour de la bourse : payé avec l\'aller (un seul paiement).\n  paidWithTripId       String?',
  ],
]);

edit('src/testing/memory-prisma.ts', [
  [
    "() => ({ status: 'pending', vatCents: 0, createdAt: new Date(), source: 'instant', lineDepartureId: null, commissionCents: null }),",
    "() => ({ status: 'pending', vatCents: 0, createdAt: new Date(), source: 'instant', lineDepartureId: null, commissionCents: null, paidWithTripId: null }),",
  ],
]);

// ── Faux Stripe : empreinte (capture manuelle) ──────────────────────────
edit('src/testing/fake-stripe.ts', [
  [
    "        status: 'requires_payment_method',\n        metadata: params.metadata,",
    "        status: 'requires_payment_method',\n        capture_method: params.capture_method ?? 'automatic',\n        amount_capturable: 0,\n        metadata: params.metadata,",
  ],
  [
    "    cancel: async (id: string) => {\n      this.canceled.push(id);\n      const i = this.intents.get(id);\n      if (i) i.status = 'canceled';\n      return i;\n    },",
    "    cancel: async (id: string) => {\n      this.canceled.push(id);\n      const i = this.intents.get(id);\n      if (i) Object.assign(i, { status: 'canceled', amount_capturable: 0 });\n      return i;\n    },\n    capture: async (id: string, _params: any, options: any) => {\n      const i = this.intents.get(id);\n      if (!i) throw new Error('No such payment_intent');\n      if (this.failNextCapture) {\n        this.failNextCapture = false;\n        throw new Error('This PaymentIntent could not be captured');\n      }\n      if (i.status === 'succeeded') return i; // même clé d'idempotence\n      if (i.status !== 'requires_capture') throw new Error(`PaymentIntent in status ${i.status} cannot be captured`);\n      this.captured.push({ id, options });\n      Object.assign(i, { status: 'succeeded', amount_received: i.amount, amount_capturable: 0 });\n      return i;\n    },",
  ],
  [
    "  /** Simule un paiement réussi côté Stripe (feuille de paiement validée). */",
    "  captured: { id: string; options: any }[] = [];\n  /** Erreur à lever sur le prochain débit d'une empreinte (carte refusée, autorisation expirée). */\n  failNextCapture = false;\n\n  /** Simule une empreinte de carte validée dans la feuille de paiement : rien n'est débité. */\n  authorize(intentId: string) {\n    const i = this.intents.get(intentId)!;\n    Object.assign(i, { status: 'requires_capture', amount_capturable: i.amount });\n    return i;\n  }\n\n  /** Simule un paiement réussi côté Stripe (feuille de paiement validée). */",
  ],
]);

// ── PaymentsService : empreintes et paiement partagé par un aller-retour ─
edit('src/payments/payments.service.ts', [
  [
    'export interface PaymentSheetParams {',
    "/** Feuille de paiement d'une empreinte de carte (bourse) : rien n'est débité à ce stade. */\nexport interface AuthorizationSheetParams {\n  offerId: string;\n  paymentIntentClientSecret: string;\n  customerId: string;\n  ephemeralKeySecret: string;\n  amountCents: number;\n  currency: string;\n}\n\nexport interface PaymentSheetParams {",
  ],
  [
    '  // ── Webhook Stripe ──────────────────────────────────────────────────',
    `  // ── Empreinte de carte (bourse de transport) ────────────────────────
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
          description: \`Proposition XLCAB \${offerId}\`,
          metadata: { offerId, userId },
        },
        { idempotencyKey: \`offer-payment-\${offerId}-\${attempt}\` },
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
      intent = await stripe.paymentIntents.capture(payment.stripePaymentIntentId, {}, { idempotencyKey: \`offer-capture-\${payment.id}\` });
    } catch (err) {
      this.logger.error(\`Débit de l'empreinte impossible (proposition \${offerId}) : \${(err as Error).message}\`);
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
      this.logger.error(\`Levée de l'empreinte échouée (proposition \${offerId}) : \${(err as Error).message}\`);
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
        { idempotencyKey: \`offer-refund-\${payment.id}\` },
      );
      await this.prisma.payment.update({ where: { id: payment.id }, data: { refundedCents: payment.amountCents } });
    } catch (err) {
      this.logger.error(\`Remboursement de la proposition \${offerId} échoué : \${(err as Error).message}\`);
      await this.audit.log({ action: 'payment.refund_failed', entity: 'TransportOffer', entityId: offerId });
    }
  }

  // ── Webhook Stripe ──────────────────────────────────────────────────`,
  ],
  // Remboursement d'annulation : paiement partagé par un aller-retour de la bourse.
  [
    "      const payment = await this.prisma.payment.findFirst({ where: { tripId }, orderBy: { createdAt: 'desc' } });\n      if (!payment?.stripePaymentIntentId || !this.stripe) return { refundedCents: 0 };\n      paymentId = payment.id;",
    "      const { payment, shareCents } = await this.paymentOf(tripId);\n      if (!payment?.stripePaymentIntentId || !this.stripe) return { refundedCents: 0 };\n      paymentId = payment.id;",
  ],
  [
    '      const amount = payment.amountCents - payment.refundedCents - feeCents;\n      if (amount <= 0) return { refundedCents: 0 };\n      await this.stripe.refunds.create(\n        { payment_intent: payment.stripePaymentIntentId, amount, reason:',
    "      // Aller-retour payé en une fois : on ne rembourse que la part de CETTE course.\n      const remaining = payment.amountCents - payment.refundedCents;\n      const amount = shareCents === null ? remaining - feeCents : Math.min(shareCents - feeCents, remaining);\n      if (amount <= 0) return { refundedCents: 0 };\n      await this.stripe.refunds.create(\n        { payment_intent: payment.stripePaymentIntentId, amount, reason:",
  ],
  [
    '  /** Remboursement manuel par l\'équipe XLCAB (geste commercial, litige). */',
    `  /**
   * Paiement d'une course. Pour un aller-retour de la bourse, un seul
   * paiement couvre les deux courses : \`shareCents\` est alors la part de
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

  /** Remboursement manuel par l'équipe XLCAB (geste commercial, litige). */`,
  ],
]);
console.log('ok');
