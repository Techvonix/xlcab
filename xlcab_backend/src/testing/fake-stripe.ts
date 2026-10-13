// Faux client Stripe pour les tests (exclu du build). N'implémente que
// les appels utilisés par PaymentsService, avec leur sémantique : clés
// d'idempotence, statuts des PaymentIntents, signature des webhooks.

export class FakeStripe {
  customersCreated: any[] = [];
  customersDeleted: string[] = [];
  intents = new Map<string, any>();
  intentCreates: { params: any; options: any }[] = [];
  refundsCreated: { params: any; options: any }[] = [];
  canceled: string[] = [];
  detached: string[] = [];
  /** Erreur à lever sur le prochain remboursement (incident Stripe). */
  failNextRefund = false;
  paymentMethodsByCustomer = new Map<string, any[]>();
  private seq = 0;

  customers = {
    create: async (params: any) => {
      const c = { id: `cus_${++this.seq}`, ...params };
      this.customersCreated.push(c);
      return c;
    },
    del: async (id: string) => {
      this.customersDeleted.push(id);
      return { id, deleted: true };
    },
  };

  ephemeralKeys = {
    create: async (params: any, options: any) => ({ id: `ephkey_${++this.seq}`, secret: `ek_secret_${params.customer}`, apiVersion: options?.apiVersion }),
  };

  paymentIntents = {
    create: async (params: any, options: any) => {
      this.intentCreates.push({ params, options });
      const id = `pi_${++this.seq}`;
      const intent = {
        id,
        object: 'payment_intent',
        client_secret: `${id}_secret_x`,
        amount: params.amount,
        amount_received: 0,
        currency: params.currency,
        status: 'requires_payment_method',
        capture_method: params.capture_method ?? 'automatic',
        amount_capturable: 0,
        metadata: params.metadata,
        payment_method_types: ['card'],
      };
      this.intents.set(id, intent);
      return intent;
    },
    retrieve: async (id: string) => {
      const i = this.intents.get(id);
      if (!i) throw new Error('No such payment_intent');
      return i;
    },
    cancel: async (id: string) => {
      this.canceled.push(id);
      const i = this.intents.get(id);
      if (i) Object.assign(i, { status: 'canceled', amount_capturable: 0 });
      return i;
    },
    capture: async (id: string, _params: any, options: any) => {
      const i = this.intents.get(id);
      if (!i) throw new Error('No such payment_intent');
      if (this.failNextCapture) {
        this.failNextCapture = false;
        throw new Error('This PaymentIntent could not be captured');
      }
      if (i.status === 'succeeded') return i; // même clé d'idempotence
      if (i.status !== 'requires_capture') throw new Error(`PaymentIntent in status ${i.status} cannot be captured`);
      this.captured.push({ id, options });
      Object.assign(i, { status: 'succeeded', amount_received: i.amount, amount_capturable: 0, latest_charge: `ch_${id}` });
      return i;
    },
  };

  refunds = {
    create: async (params: any, options: any) => {
      if (this.failNextRefund) {
        this.failNextRefund = false;
        throw new Error('Stripe API indisponible');
      }
      this.refundsCreated.push({ params, options });
      return { id: `re_${++this.seq}`, amount: params.amount, status: 'succeeded' };
    },
  };

  paymentMethods = {
    list: async ({ customer }: any) => ({ data: this.paymentMethodsByCustomer.get(customer) ?? [] }),
    retrieve: async (id: string) => {
      for (const [customer, list] of this.paymentMethodsByCustomer) {
        const pm = list.find((m) => m.id === id);
        if (pm) return { ...pm, customer };
      }
      throw new Error('No such payment_method');
    },
    detach: async (id: string) => {
      this.detached.push(id);
      return { id };
    },
  };

  setupIntents = {
    create: async (params: any) => ({ id: `seti_${++this.seq}`, client_secret: `seti_secret_${params.customer}` }),
  };

  // ── Stripe Connect : reversements aux opérateurs ──
  transfersCreated: { params: any; options: any; id: string }[] = [];
  /** Erreur à lever sur le prochain virement (incident Stripe). */
  failNextTransfer = false;

  transfers = {
    create: async (params: any, options: any) => {
      if (this.failNextTransfer) {
        this.failNextTransfer = false;
        throw new Error('Stripe API indisponible');
      }
      // Même clé d'idempotence = même virement, comme chez Stripe.
      const same = this.transfersCreated.find((t) => options?.idempotencyKey && t.options?.idempotencyKey === options.idempotencyKey);
      if (same) return { id: same.id, amount: same.params.amount };
      const id = `tr_${++this.seq}`;
      this.transfersCreated.push({ params, options, id });
      return { id, amount: params.amount };
    },
  };

  // ── Stripe Connect : comptes de versement des opérateurs ──
  accounts_ = new Map<string, any>();
  accountCreates: { params: any; options: any }[] = [];
  accountLinksCreated: any[] = [];

  accounts = {
    create: async (params: any, options: any) => {
      // Même clé d'idempotence = même compte, comme chez Stripe.
      const same = this.accountCreates.find((c) => options?.idempotencyKey && c.options?.idempotencyKey === options.idempotencyKey);
      this.accountCreates.push({ params, options });
      if (same) return [...this.accounts_.values()].find((a) => a.metadata?.userId === params.metadata?.userId);
      const account = {
        id: `acct_${++this.seq}`,
        object: 'account',
        type: params.type,
        country: params.country,
        email: params.email,
        metadata: params.metadata,
        details_submitted: false,
        payouts_enabled: false,
        capabilities: { transfers: 'inactive' },
        requirements: { currently_due: ['external_account', 'individual.verification.document'], disabled_reason: 'requirements.past_due' },
      };
      this.accounts_.set(account.id, account);
      return account;
    },
    retrieve: async (id: string) => {
      const a = this.accounts_.get(id);
      if (!a) throw new Error('No such account');
      return a;
    },
    createLoginLink: async (id: string) => ({ object: 'login_link', url: `https://connect.stripe.test/express/${id}` }),
  };

  accountLinks = {
    create: async (params: any) => {
      this.accountLinksCreated.push(params);
      return { object: 'account_link', url: `https://connect.stripe.test/setup/${params.account}/${++this.seq}`, expires_at: Math.floor(Date.now() / 1000) + 300 };
    },
  };

  /** Simule la fin de l'ouverture du compte : dossier complet, versements activés par Stripe. */
  completeOnboarding(accountId: string) {
    const a = this.accounts_.get(accountId)!;
    a.details_submitted = true;
    a.payouts_enabled = true;
    a.capabilities = { transfers: 'active' };
    a.requirements = { currently_due: [], disabled_reason: null };
    return a;
  }

  webhooks = {
    /** Signature factice : "valid:<secret>". Toute autre valeur est rejetée. */
    constructEvent: (raw: Buffer | string, signature: string, secret: string) => {
      if (signature !== `valid:${secret}`) throw new Error('No signatures found matching the expected signature');
      return JSON.parse(raw.toString());
    },
  };

  captured: { id: string; options: any }[] = [];
  /** Erreur à lever sur le prochain débit d'une empreinte (carte refusée, autorisation expirée). */
  failNextCapture = false;

  /** Simule une empreinte de carte validée dans la feuille de paiement : rien n'est débité. */
  authorize(intentId: string) {
    const i = this.intents.get(intentId)!;
    Object.assign(i, { status: 'requires_capture', amount_capturable: i.amount });
    return i;
  }

  /** Simule un paiement réussi côté Stripe (feuille de paiement validée). */
  succeed(intentId: string) {
    const i = this.intents.get(intentId)!;
    i.status = 'succeeded';
    i.amount_received = i.amount;
    i.latest_charge = `ch_${intentId}`;
    return i;
  }
}
