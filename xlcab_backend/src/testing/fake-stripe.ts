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
      if (i) i.status = 'canceled';
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

  webhooks = {
    /** Signature factice : "valid:<secret>". Toute autre valeur est rejetée. */
    constructEvent: (raw: Buffer | string, signature: string, secret: string) => {
      if (signature !== `valid:${secret}`) throw new Error('No signatures found matching the expected signature');
      return JSON.parse(raw.toString());
    },
  };

  /** Simule un paiement réussi côté Stripe (feuille de paiement validée). */
  succeed(intentId: string) {
    const i = this.intents.get(intentId)!;
    i.status = 'succeeded';
    i.amount_received = i.amount;
    return i;
  }
}
