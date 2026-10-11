import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createHash } from 'crypto';
import * as request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { BookingsModule } from '../bookings/bookings.module';
import { TripsModule } from '../trips/trips.module';
import { FakeRedis } from '../testing/fake-redis';
import { FakeStripe } from '../testing/fake-stripe';
import { memoryPrisma } from '../testing/memory-prisma';
import { PaymentsModule } from './payments.module';
import { PaymentsService } from './payments.service';
import { STRIPE_CLIENT } from './stripe.provider';

// Paiement Stripe de bout en bout : réservation → feuille de paiement →
// confirmation / webhook → recherche de chauffeur ; annulation →
// remboursement selon les CGV. Stripe, base et Redis simulés.

const JWT_SECRET = 'payments-secret';
const WHSEC = 'whsec_test';

describe('Paiements Stripe (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  let stripe: FakeStripe;
  let fetchMock: jest.SpyInstance;
  const jwt = new JwtService();
  const as = (sub: string, role: string) => `Bearer ${jwt.sign({ sub, role, jti: `j-${sub}` }, { secret: JWT_SECRET })}`;
  const passenger = () => as('p1', 'passenger');
  const http = () => request(app.getHttpServer());

  const bookingBody = (over: object = {}) => ({
    origin: { lat: 48.8443, lng: 2.3744 },
    destination: { lat: 49.4488, lng: 1.0942 },
    originAddress: 'Gare de Lyon, Paris',
    destinationAddress: 'Gare de Rouen',
    shuttleType: 'bleue',
    scheduledAt: new Date(Date.now() + 26 * 3600_000).toISOString(),
    seats: 2,
    ...over,
  });

  async function book(over: object = {}) {
    const res = await http().post('/api/v1/bookings/passenger').set('Authorization', passenger()).send(bookingBody(over));
    expect(res.status).toBe(201);
    return res.body as { tripId: string; payment: { paymentIntentClientSecret: string } };
  }

  const intentId = () => db.payment.rows[0].stripePaymentIntentId as string;
  const trip = (id: string) => db.trip.rows.find((t: any) => t.id === id);

  const webhook = (event: object, signature = `valid:${WHSEC}`) =>
    http().post('/api/v1/webhooks/stripe').set('stripe-signature', signature).set('Content-Type', 'application/json').send(JSON.stringify(event));

  beforeEach(async () => {
    db = memoryPrisma();
    stripe = new FakeStripe();
    db.user.rows.push(
      { id: 'p1', email: 'lea@x.fr', role: 'passenger', jurisdiction: 'FR', deletedAt: null, stripeCustomerId: null },
      { id: 'p2', email: 'autre@x.fr', role: 'passenger', jurisdiction: 'FR', deletedAt: null, stripeCustomerId: 'cus_autre' },
      { id: 'ops', email: 'ops@xlcab.com', role: 'admin', jurisdiction: 'FR', deletedAt: null },
    );

    @Global()
    @Module({
      providers: [
        { provide: PrismaService, useValue: db },
        { provide: RedisService, useValue: new FakeRedis() },
      ],
      exports: [PrismaService, RedisService],
    })
    class FakeInfraModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET, JWT_REFRESH_SECRET: 'r', GOOGLE_MAPS_API_KEY: 'k', STRIPE_WEBHOOK_SECRET: WHSEC })],
        }),
        FakeInfraModule,
        AuthModule,
        PaymentsModule,
        BookingsModule,
        TripsModule,
      ],
    })
      .overrideProvider(STRIPE_CLIENT)
      .useValue(stripe)
      .overrideProvider(TrackingGateway)
      .useValue({ emitTripStatus: jest.fn(), emitToDriver: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    // Google Routes : 135,4 km → Navette Bleue 12 186 c TTC (TVA 0 %).
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ routes: [{ distanceMeters: 135_400, duration: '5820s' }] }),
    } as Response);
  });

  afterEach(async () => {
    fetchMock.mockRestore();
    await app.close();
  });

  describe('réservation et paiement', () => {
    it('réservation : course en attente de paiement, montant fixé par le serveur', async () => {
      const res = await book();

      expect(trip(res.tripId)).toMatchObject({ status: 'awaiting_payment', totalPriceCents: 12186 });
      expect(stripe.intentCreates[0]).toMatchObject({
        params: { amount: 12186, currency: 'eur', customer: 'cus_1', metadata: { tripId: res.tripId, userId: 'p1' } },
        options: { idempotencyKey: `trip-payment-${res.tripId}` },
      });
      expect(db.payment.rows[0]).toMatchObject({ tripId: res.tripId, amountCents: 12186, status: 'requires_payment' });
      expect(res.payment).toMatchObject({ paymentIntentClientSecret: expect.stringContaining('_secret_'), customerId: 'cus_1', ephemeralKeySecret: 'ek_secret_cus_1' });
      // Le client Stripe est mémorisé sur le compte.
      expect(db.user.rows[0].stripeCustomerId).toBe('cus_1');
    });

    it('reprise du paiement (app fermée) : le même PaymentIntent est réutilisé', async () => {
      const { tripId } = await book();
      const again = await http().post('/api/v1/payments/intent').set('Authorization', passenger()).send({ tripId });
      expect(again.status).toBe(200);
      expect(stripe.intentCreates).toHaveLength(1);
    });

    it('confirmation après la feuille de paiement : course en recherche de chauffeur', async () => {
      const { tripId } = await book();
      stripe.succeed(intentId());

      const res = await http().post('/api/v1/payments/confirm').set('Authorization', passenger()).send({ tripId });

      expect(res.body.paymentStatus).toBe('succeeded');
      expect(db.payment.rows[0].status).toBe('succeeded');
      // Départ dans 26 h : la recherche est différée à T − 3 h (planificateur).
      expect(trip(tripId).status).toBe('pending');
      expect(db.notification.rows.find((n: any) => n.type === 'payment.succeeded')).toMatchObject({
        userId: 'p1',
        body: expect.stringContaining('quelques heures avant le départ'),
      });
    });

    it('départ proche (2 h 30) : recherche de chauffeur lancée dès le paiement', async () => {
      const { tripId } = await book({ scheduledAt: new Date(Date.now() + 2.5 * 3600_000).toISOString() });
      stripe.succeed(intentId());
      await http().post('/api/v1/payments/confirm').set('Authorization', passenger()).send({ tripId });
      // Aucun chauffeur en ligne dans ce test.
      expect(trip(tripId).status).toBe('no_driver');
    });

    it('paiement arrivé après annulation de la course : remboursement intégral', async () => {
      const { tripId } = await book();
      Object.assign(trip(tripId), { status: 'cancelled' });
      stripe.succeed(intentId());
      await http().post('/api/v1/payments/confirm').set('Authorization', passenger()).send({ tripId });
      expect(trip(tripId).status).toBe('cancelled');
      expect(stripe.refundsCreated[0].params).toMatchObject({ amount: db.payment.rows[0].amountCents });
    });

    it('un autre utilisateur ne peut pas payer ni confirmer la course', async () => {
      const { tripId } = await book();
      expect((await http().post('/api/v1/payments/intent').set('Authorization', as('p2', 'passenger')).send({ tripId })).status).toBe(404);
      expect((await http().post('/api/v1/payments/confirm').set('Authorization', as('p2', 'passenger')).send({ tripId })).status).toBe(404);
    });

    it('le client ne peut pas imposer de montant', async () => {
      const res = await http().post('/api/v1/bookings/passenger').set('Authorization', passenger()).send(bookingBody({ totalCents: 1 }));
      expect(res.status).toBe(400);
    });
  });

  describe('historique passager (GET /bookings/passenger/history)', () => {
    const add = (id: string, passengerId: string, status: string, daysAgo: number, extra: object = {}) =>
      db.trip.rows.push({
        id, passengerId, status, shuttleType: 'bleue', originAddress: 'Paris', destinationAddress: 'Rouen',
        scheduledAt: new Date(Date.now() - daysAgo * 86400_000), totalPriceCents: 12000, corporateId: null, ...extra,
      });

    it('ses courses seulement, de la plus récente à la plus ancienne, sans les réservations impayées', async () => {
      add('ancienne', 'p1', 'completed', 10);
      add('recente', 'p1', 'cancelled', 2);
      add('entreprise', 'p1', 'completed', 5, { corporateId: 'corp-1' });
      add('impayee', 'p1', 'awaiting_payment', 1);
      add('autre', 'p2', 'completed', 1);

      const res = await http().get('/api/v1/bookings/passenger/history').set('Authorization', passenger());

      expect(res.status).toBe(200);
      expect(res.body.map((t: any) => t.id)).toEqual(['recente', 'entreprise', 'ancienne']);
      expect(res.body[0]).toMatchObject({ originAddress: 'Paris', status: 'cancelled', currency: 'EUR', paidByCompany: false });
      expect(res.body[1].paidByCompany).toBe(true);
      expect(res.body[0]).not.toHaveProperty('corporateId');
    });

    it('pagination (limit ≤ 50, page)', async () => {
      for (let i = 0; i < 5; i++) add(`t${i}`, 'p1', 'completed', i);
      const page2 = await http().get('/api/v1/bookings/passenger/history?limit=2&page=2').set('Authorization', passenger());
      expect(page2.body.map((t: any) => t.id)).toEqual(['t2', 't3']);
      expect((await http().get('/api/v1/bookings/passenger/history?limit=500').set('Authorization', passenger())).status).toBe(400);
    });
  });

  describe('webhook Stripe', () => {
    const succeeded = (id: string, amount = 12186) => ({
      id: `evt_${Math.random()}`,
      type: 'payment_intent.succeeded',
      data: { object: { id, amount_received: amount, payment_method_types: ['card'] } },
    });

    it('signature invalide : refusé, rien n’est modifié', async () => {
      await book();
      const res = await webhook(succeeded(intentId()), 'forged');
      expect(res.status).toBe(400);
      expect(db.payment.rows[0].status).toBe('requires_payment');
    });

    it('paiement réussi : traité une seule fois même si Stripe renvoie l’événement', async () => {
      const { tripId } = await book();
      const event = succeeded(intentId());
      expect((await webhook(event)).body).toEqual({ received: true });
      expect((await webhook(event)).body).toEqual({ received: true, duplicate: true });
      expect(db.payment.rows[0].status).toBe('succeeded');
      expect(db.notification.rows.filter((n: any) => n.type === 'payment.succeeded')).toHaveLength(1);
      expect(trip(tripId).status).not.toBe('awaiting_payment');
    });

    it('montant encaissé différent du prix : paiement NON validé, anomalie tracée', async () => {
      const { tripId } = await book();
      await webhook(succeeded(intentId(), 100));
      expect(db.payment.rows[0].status).toBe('requires_payment');
      expect(trip(tripId).status).toBe('awaiting_payment');
      expect(db.auditLog.rows.at(-1)).toMatchObject({ action: 'payment.amount_mismatch' });
    });

    it('remboursement constaté par Stripe : montant remboursé mis à jour', async () => {
      await book();
      await webhook({ id: 'evt_r', type: 'charge.refunded', data: { object: { payment_intent: intentId(), amount_refunded: 6093 } } });
      expect(db.payment.rows[0].refundedCents).toBe(6093);
    });
  });

  describe('annulation et remboursement (CGV)', () => {
    async function paidTrip(status: string, hoursBefore: number) {
      const { tripId } = await book();
      stripe.succeed(intentId());
      db.payment.rows[0].status = 'succeeded';
      Object.assign(trip(tripId), { status, scheduledAt: new Date(Date.now() + hoursBefore * 3600_000), ...(status === 'accepted' ? { driverId: 'd1' } : {}) });
      return tripId;
    }
    const cancel = (tripId: string) =>
      http().post(`/api/v1/trips/${tripId}/cancel`).set('Authorization', passenger()).send({ reason: 'Imprévu' });

    it('chauffeur engagé, 10 h avant : 50 % de frais, 50 % remboursés', async () => {
      const tripId = await paidTrip('accepted', 10);
      const res = await cancel(tripId);

      expect(res.body).toMatchObject({ feePercent: 50, feeCents: 6093, refundedCents: 6093 });
      expect(stripe.refundsCreated[0]).toMatchObject({
        params: { payment_intent: intentId(), amount: 6093 },
        options: { idempotencyKey: `cancel-refund-${tripId}` },
      });
      expect(db.payment.rows[0].refundedCents).toBe(6093);
    });

    it('aucun chauffeur trouvé : aucun frais, même 1 h avant (remboursement intégral)', async () => {
      const tripId = await paidTrip('no_driver', 1);
      const res = await cancel(tripId);
      expect(res.body).toMatchObject({ feePercent: 0, refundedCents: 12186 });
    });

    it('réservation jamais payée : demande de paiement annulée chez Stripe', async () => {
      const { tripId } = await book();
      const res = await cancel(tripId);
      expect(res.body).toMatchObject({ status: 'cancelled', feeCents: 0, refundedCents: 0 });
      expect(stripe.canceled).toEqual([intentId()]);
      expect(db.payment.rows[0].status).toBe('canceled');
    });

    it('incident Stripe : l’annulation est quand même enregistrée, remboursement à reprendre', async () => {
      const tripId = await paidTrip('accepted', 48);
      stripe.failNextRefund = true;
      const res = await cancel(tripId);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'cancelled', refundPending: true });
      expect(trip(tripId).status).toBe('cancelled');
      expect(db.auditLog.rows.some((l: any) => l.action === 'payment.refund_failed')).toBe(true);
    });
  });

  describe('moyens de paiement enregistrés', () => {
    beforeEach(() => {
      db.user.rows[0].stripeCustomerId = 'cus_lea';
      stripe.paymentMethodsByCustomer.set('cus_lea', [{ id: 'pm_lea', card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 } }]);
      stripe.paymentMethodsByCustomer.set('cus_autre', [{ id: 'pm_autre', card: { brand: 'mastercard', last4: '4444' } }]);
    });

    it('liste : marque, 4 derniers chiffres et expiration uniquement', async () => {
      const res = await http().get('/api/v1/payments/methods').set('Authorization', passenger());
      expect(res.body).toEqual([{ id: 'pm_lea', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 }]);
    });

    it('suppression : seulement ses propres cartes', async () => {
      expect((await http().delete('/api/v1/payments/methods/pm_autre').set('Authorization', passenger())).status).toBe(404);
      expect((await http().delete('/api/v1/payments/methods/pas-un-id').set('Authorization', passenger())).status).toBe(404);
      expect((await http().delete('/api/v1/payments/methods/pm_lea').set('Authorization', passenger())).status).toBe(200);
      expect(stripe.detached).toEqual(['pm_lea']);
    });
  });

  describe('remboursement manuel (équipe XLCAB)', () => {
    const proof = () =>
      jwt.sign({ sub: 'ops', typ: 'mfa' }, { secret: createHash('sha256').update(`${JWT_SECRET}:xlcab-2fa-proof`).digest('hex') });

    it('exige la double authentification, puis rembourse dans la limite du montant payé', async () => {
      await book();
      db.payment.rows[0].status = 'succeeded';
      const id = db.payment.rows[0].id;
      const url = `/api/v1/payments/${id}/refund`;

      expect((await http().post(url).set('Authorization', as('ops', 'admin')).send({ reason: 'Geste commercial' })).status).toBe(403);
      const tooMuch = await http().post(url).set({ Authorization: as('ops', 'admin'), 'X-2FA-Token': proof() }).send({ amountCents: 99999, reason: 'Geste commercial' });
      expect(tooMuch.status).toBe(400);

      const ok = await http().post(url).set({ Authorization: as('ops', 'admin'), 'X-2FA-Token': proof() }).send({ amountCents: 2000, reason: 'Geste commercial' });
      expect(ok.body).toEqual({ paymentId: id, refundedCents: 2000 });
      expect(db.auditLog.rows.at(-1)).toMatchObject({ action: 'payment.refund', userId: 'ops' });
    });
  });
});

describe('sans clé Stripe configurée', () => {
  it('le paiement répond "indisponible" au lieu de planter', async () => {
    const service = new PaymentsService({} as any, {} as any, { get: () => undefined } as any, null, {} as any, {} as any, {} as any);
    await expect(service.paymentSheet('u', 't')).rejects.toMatchObject({ status: 503 });
  });
});
