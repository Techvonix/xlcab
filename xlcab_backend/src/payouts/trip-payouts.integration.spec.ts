import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import * as request from 'supertest';
import { AuditModule } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { addDays, localDateOf } from '../common/local-time';
import { LineBookingsModule } from '../line-bookings/line-bookings.module';
import { NotificationsModule } from '../notifications/notifications.service';
import { DEFAULT_OPERATOR_TERMS_VERSION } from '../operators/line-schedule';
import { OperatorsModule } from '../operators/operators.module';
import { STRIPE_CLIENT } from '../payments/stripe.provider';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FakeRedis } from '../testing/fake-redis';
import { FakeStripe } from '../testing/fake-stripe';
import { memoryPrisma } from '../testing/memory-prisma';
import { mfaProof } from '../testing/two-factor-proof';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { PAYOUT_MAX_ATTEMPTS, TripPayoutsService, operatorShareCents } from './trip-payouts';

// Stripe Connect, étape 4 (vrai HTTP ; base, Redis et Stripe simulés) :
// une fois le trajet terminé, la part de celui qui l'a assuré est virée
// sur son compte de versement ; XLCAB garde sa commission.

const JWT_SECRET = 'trip-payouts-secret';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DJAMEL = id(1);
const KARIM = id(2); // secours
const PAX1 = id(11);
const PAX2 = id(12);
const VAN = { djamel: id(21), karim: id(22) };
const MIN = 60_000;
const HOUR = 60 * MIN;

describe('Reversement à l’opérateur en fin de trajet (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  let stripe: FakeStripe;
  let payouts: TripPayoutsService;
  const jwt = new JwtService();
  const as = (sub: string, role: string) => `Bearer ${jwt.sign({ sub, role, jti: `j-${sub}` }, { secret: JWT_SECRET })}`;
  const admin = { Authorization: as('ops', 'admin'), 'X-2FA-Token': mfaProof(JWT_SECRET, 'ops') };
  const http = () => request(app.getHttpServer());
  const tomorrow = addDays(localDateOf(new Date(), 'Europe/Paris'), 1);
  let lineId: string;

  const departure = () => db.lineDeparture.rows.find((d: any) => d.lineId === lineId && d.localDate === tomorrow);
  const trip = (tripId: string) => db.trip.rows.find((t: any) => t.id === tripId);
  const payoutOf = (tripId: string) => db.payout.rows.find((p: any) => p.tripId === tripId);
  const account = (userId: string) => db.payoutAccount.rows.find((a: any) => a.userId === userId);
  const notified = (userId: string, type: string) => db.notification.rows.filter((n: any) => n.userId === userId && n.type === type).length;
  const mine = (who: string) => http().get('/api/v1/operators/me/payouts').set('Authorization', as(who, 'driver'));

  /** Réservation payée en ligne : 2 places à 25 € = 50 €, commission 10 % = 5 €, part de l'opérateur 45 €. */
  async function paidBooking(pax = PAX1, seats = 2): Promise<string> {
    const res = await http().post('/api/v1/lines/bookings').set('Authorization', as(pax, 'passenger')).send({ departureId: departure().id, seats });
    expect(res.status).toBe(201);
    const intentId = db.payment.rows.find((p: any) => p.tripId === res.body.tripId).stripePaymentIntentId;
    stripe.succeed(intentId);
    await http().post('/api/v1/payments/confirm').set('Authorization', as(pax, 'passenger')).send({ tripId: res.body.tripId });
    expect(trip(res.body.tripId).status).toBe('accepted');
    return res.body.tripId;
  }

  /** Le chauffeur opère le départ jusqu'au bout. */
  async function runDeparture(who = DJAMEL) {
    const at = new Date(Date.now() + 40 * MIN);
    departure().departureAt = at;
    for (const t of db.trip.rows.filter((x: any) => x.lineDepartureId === departure().id)) t.scheduledAt = at;
    const started = await http().post(`/api/v1/operators/me/departures/${departure().id}/start`).set('Authorization', as(who, 'driver'));
    expect(started.status).toBe(200);
    const done = await http().post(`/api/v1/operators/me/departures/${departure().id}/complete`).set('Authorization', as(who, 'driver'));
    expect(done.status).toBe(200);
    return done;
  }

  /** Course terminée et payée, posée directement en base (bourse, cas limites). */
  function completedTrip(over: Record<string, unknown> = {}, payment: Record<string, unknown> | null = {}) {
    const tripId = id(100 + db.trip.rows.length);
    db.trip.rows.push({
      id: tripId, type: 'passenger', status: 'completed', source: 'market', passengerId: PAX1, driverId: DJAMEL, vehicleId: VAN.djamel,
      totalPriceCents: 18000, vatCents: 0, commissionCents: 1800, paidWithTripId: null, completedAt: new Date(), createdAt: new Date(),
      originAddress: 'Paris', destinationAddress: 'Beauvais', scheduledAt: new Date(), ...over,
    });
    if (payment) {
      const intent = { id: `pi_m${db.payment.rows.length}`, status: 'succeeded', amount: 18000, amount_received: 18000, latest_charge: `ch_m${db.payment.rows.length}` };
      stripe.intents.set(intent.id, intent);
      db.payment.rows.push({
        id: id(200 + db.payment.rows.length), tripId, userId: PAX1, stripePaymentIntentId: intent.id, amountCents: 18000, refundedCents: 0, currency: 'EUR',
        status: 'succeeded', createdAt: new Date(), ...payment,
      });
    }
    return tripId;
  }

  beforeEach(async () => {
    process.env.LINE_PAYMENT_MODE = 'connect';
    db = memoryPrisma();
    stripe = new FakeStripe();
    const approved = new Date('2026-09-01');
    for (const [uid, email, firstName] of [[DJAMEL, 'djamel@test.fr', 'Djamel'], [KARIM, 'karim@test.fr', 'Karim']]) {
      db.user.rows.push({ id: uid, email, role: 'driver', firstName, lastName: 'Test', phone: '+33611111111', deletedAt: null });
      db.driverProfile.rows.push({ id: uid, approvedAt: approved, rating: 4.9, ratingCount: 10, totalTrips: 10, languages: ['fr'] });
      db.operatorProfile.rows.push({
        id: uid, kind: 'independent', status: 'verified', perSeatAllowed: true, transportLicense: 'LOTI-1',
        termsAcceptedAt: approved, termsVersion: DEFAULT_OPERATOR_TERMS_VERSION, cities: [], services: [],
      });
      db.payoutAccount.rows.push({ userId: uid, stripeAccountId: `acct_${firstName}`, detailsSubmitted: true, payoutsEnabled: true, transfersActive: true, requirementsDue: 0 });
    }
    db.vehicle.rows.push(
      { id: VAN.djamel, driverId: DJAMEL, brand: 'Renault', model: 'Trafic', plate: 'AA-001-AA', capacity: 8, dashcamActive: true, shuttleType: 'bleue', jurisdiction: 'FR' },
      { id: VAN.karim, driverId: KARIM, brand: 'Renault', model: 'Trafic', plate: 'AA-002-AA', capacity: 8, dashcamActive: true, shuttleType: 'bleue', jurisdiction: 'FR' },
    );
    db.user.rows.push(
      { id: PAX1, email: 'lea@test.fr', role: 'passenger', firstName: 'Léa', phone: '+33622222222', deletedAt: null, stripeCustomerId: null },
      { id: PAX2, email: 'tom@test.fr', role: 'passenger', firstName: 'Tom', deletedAt: null, stripeCustomerId: null },
      { id: 'ops', email: 'ops@xlcab.com', role: 'admin', deletedAt: null },
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
          load: [() => ({ JWT_SECRET, JWT_REFRESH_SECRET: 'r', GOOGLE_MAPS_API_KEY: 'k', TWO_FACTOR_ENC_KEY: randomBytes(32).toString('base64') })],
        }),
        FakeInfraModule,
        AuditModule,
        NotificationsModule,
        AuthModule,
        OperatorsModule,
        LineBookingsModule,
      ],
    })
      .overrideProvider(TrackingGateway)
      .useValue({ emitTripStatus: jest.fn(), emitToDriver: jest.fn() })
      .overrideProvider(STRIPE_CLIENT)
      .useValue(stripe)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    payouts = moduleRef.get(TripPayoutsService);

    const created = await http().post('/api/v1/operators/me/lines').set('Authorization', as(DJAMEL, 'driver')).send({
      vehicleId: VAN.djamel,
      originAddress: 'Porte Maillot, Paris', originLat: 48.8781, originLng: 2.2834,
      destinationAddress: 'Aéroport de Beauvais', destinationLat: 49.4544, destinationLng: 2.1128,
      departureTime: '05:00', daysOfWeek: [1, 2, 3, 4, 5, 6, 7], startDate: tomorrow, seats: 8, luggage: 16,
      pricingMode: 'per_seat', priceCents: 2500, durationMin: 75,
    });
    expect(created.status).toBe(201);
    lineId = created.body.id;
    await http().post('/api/v1/operators/me/departures/confirm').set('Authorization', as(DJAMEL, 'driver')).send({ lineId, until: tomorrow });
  });

  afterEach(async () => {
    delete process.env.LINE_PAYMENT_MODE;
    await app.close();
  });

  it('part de l’opérateur = prix hors taxes moins la commission, jamais négative', () => {
    expect(operatorShareCents({ totalPriceCents: 5000, vatCents: 0, commissionCents: 500 })).toBe(4500);
    expect(operatorShareCents({ totalPriceCents: 12000, vatCents: 2000, commissionCents: 1000 })).toBe(9000);
    expect(operatorShareCents({ totalPriceCents: 100, vatCents: 0, commissionCents: 500 })).toBe(0);
    expect(operatorShareCents({ totalPriceCents: null, vatCents: null, commissionCents: null })).toBe(0);
  });

  it('fin du départ : la part de l’opérateur est virée sur son compte de versement', async () => {
    const tripId = await paidBooking();
    expect(db.payout.rows).toHaveLength(0); // rien avant la fin du trajet
    await runDeparture();

    expect(stripe.transfersCreated).toHaveLength(1);
    const transfer = stripe.transfersCreated[0];
    const intentId = db.payment.rows[0].stripePaymentIntentId;
    expect(transfer.params).toMatchObject({ amount: 4500, currency: 'eur', destination: 'acct_Djamel', source_transaction: `ch_${intentId}`, metadata: { tripId } });
    expect(payoutOf(tripId)).toMatchObject({ status: 'paid', amountCents: 4500, driverId: DJAMEL, stripeTransferId: transfer.id, stripeAccountId: 'acct_Djamel' });
    expect(payoutOf(tripId).paidAt).toBeInstanceOf(Date);
    expect(notified(DJAMEL, 'payout.paid')).toBe(1);
    expect(db.auditLog.rows.some((l: any) => l.action === 'payout.paid' && l.entityId === payoutOf(tripId).id)).toBe(true);
  });

  it('un virement par réservation du départ', async () => {
    const a = await paidBooking(PAX1, 2);
    const b = await paidBooking(PAX2, 3);
    await runDeparture();
    expect(stripe.transfersCreated.map((t) => t.params.amount).sort()).toEqual([4500, 6750]);
    expect(payoutOf(a).status).toBe('paid');
    expect(payoutOf(b).status).toBe('paid');

    const res = await mine(DJAMEL);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ paidCents: 11250, pendingCents: 0 });
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toMatchObject({ status: 'paid', originAddress: 'Porte Maillot, Paris' });
    // Jamais d'identifiant Stripe dans la réponse.
    expect(JSON.stringify(res.body)).not.toMatch(/acct_|tr_|ch_|pi_/);
  });

  it('départ repris par un secours : c’est le secours qui est payé, pas le titulaire', async () => {
    const tripId = await paidBooking();
    // Reprise du départ par Karim (protocole de secours).
    Object.assign(departure(), { rescueStatus: 'rescued', driverId: KARIM, vehicleId: VAN.karim });
    Object.assign(trip(tripId), { driverId: KARIM, vehicleId: VAN.karim });
    await runDeparture(KARIM);

    expect(stripe.transfersCreated).toHaveLength(1);
    expect(stripe.transfersCreated[0].params.destination).toBe('acct_Karim');
    expect(payoutOf(tripId)).toMatchObject({ driverId: KARIM, status: 'paid' });
    expect((await mine(DJAMEL)).body.items).toHaveLength(0);
    expect((await mine(KARIM)).body.paidCents).toBe(4500);
  });

  it('compte de versement pas prêt : le revenu attend, l’opérateur est prévenu une seule fois, puis il est versé', async () => {
    const tripId = await paidBooking();
    account(DJAMEL).payoutsEnabled = false; // suspendu par Stripe après la mise en vente
    await runDeparture();
    expect(stripe.transfersCreated).toHaveLength(0);
    expect(payoutOf(tripId)).toMatchObject({ status: 'blocked', amountCents: 4500 });
    expect(notified(DJAMEL, 'payout.blocked')).toBe(1);
    expect((await mine(DJAMEL)).body).toMatchObject({ paidCents: 0, pendingCents: 4500 });

    // Revérifié chaque heure, sans le relancer à chaque fois.
    expect(await payouts.tick(new Date(Date.now() + 30 * MIN))).toMatchObject({ paid: 0, blocked: 0 });
    expect(await payouts.tick(new Date(Date.now() + 90 * MIN))).toMatchObject({ blocked: 1 });
    expect(notified(DJAMEL, 'payout.blocked')).toBe(1);

    account(DJAMEL).payoutsEnabled = true;
    expect(await payouts.tick(new Date(Date.now() + 3 * HOUR))).toMatchObject({ paid: 1 });
    expect(payoutOf(tripId).status).toBe('paid');
    expect(stripe.transfersCreated[0].params).toMatchObject({ amount: 4500, destination: 'acct_Djamel' });
  });

  it('incident Stripe : repris automatiquement, sans jamais virer deux fois', async () => {
    const tripId = await paidBooking();
    stripe.failNextTransfer = true;
    await runDeparture();
    expect(payoutOf(tripId)).toMatchObject({ status: 'failed', attempts: 1, lastError: 'Stripe API indisponible' });
    // Pour l'opérateur c'est « en cours » : il n'a rien à faire.
    expect((await mine(DJAMEL)).body.items[0].status).toBe('pending');

    // Reprise 5 minutes après l'échec (mesuré depuis l'échec, pas depuis l'horloge du test).
    const retryAt = payoutOf(tripId).nextAttemptAt.getTime();
    expect(await payouts.tick(new Date(retryAt - MIN))).toMatchObject({ paid: 0 });
    expect(await payouts.tick(new Date(retryAt + MIN))).toMatchObject({ paid: 1 });
    await payouts.tick(new Date(Date.now() + 2 * HOUR));
    await payouts.onTripCompleted(tripId);
    expect(stripe.transfersCreated).toHaveLength(1);
    expect(payoutOf(tripId)).toMatchObject({ status: 'paid', lastError: null });
  });

  it('après 10 échecs : plus de reprise automatique, l’équipe relance à la main', async () => {
    const tripId = await paidBooking();
    stripe.failNextTransfer = true;
    await runDeparture();
    Object.assign(payoutOf(tripId), { attempts: PAYOUT_MAX_ATTEMPTS - 1, nextAttemptAt: new Date() });
    stripe.failNextTransfer = true;
    await payouts.tick(new Date(Date.now() + MIN));
    expect(payoutOf(tripId)).toMatchObject({ status: 'failed', attempts: PAYOUT_MAX_ATTEMPTS, nextAttemptAt: null });
    expect(await payouts.tick(new Date(Date.now() + 48 * HOUR))).toMatchObject({ paid: 0, failed: 0 });
    expect(db.auditLog.rows.some((l: any) => l.action === 'payout.abandoned')).toBe(true);

    const list = await http().get('/api/v1/admin/payouts').set(admin);
    expect(list.status).toBe(200);
    expect(list.body[0]).toMatchObject({ tripId, status: 'failed', needsAttention: true, driverName: 'Djamel Test', amountCents: 4500 });

    const retry = await http().post(`/api/v1/admin/payouts/${list.body[0].id}/retry`).set(admin);
    expect(retry.body).toEqual({ id: list.body[0].id, status: 'paid' });
    expect(db.auditLog.rows.some((l: any) => l.action === 'payout.retry' && l.userId === 'ops')).toBe(true);
    // Déjà versé : pas de seconde relance.
    expect((await http().post(`/api/v1/admin/payouts/${list.body[0].id}/retry`).set(admin)).status).toBe(409);
    expect(stripe.transfersCreated).toHaveLength(1);
  });

  it('routes admin : 2FA exigée, interdites aux chauffeurs', async () => {
    expect((await http().get('/api/v1/admin/payouts').set('Authorization', as('ops', 'admin'))).status).toBe(403);
    expect((await http().get('/api/v1/admin/payouts').set('Authorization', as(DJAMEL, 'driver'))).status).toBe(403);
    expect((await http().get('/api/v1/admin/payouts?status=nimporte').set(admin)).status).toBe(400);
    expect((await http().get('/api/v1/operators/me/payouts').set('Authorization', as(PAX1, 'passenger'))).status).toBe(403);
  });

  it('paiement différé (sans encaissement en ligne) : aucun reversement', async () => {
    process.env.LINE_PAYMENT_MODE = 'deferred';
    const res = await http().post('/api/v1/lines/bookings').set('Authorization', as(PAX1, 'passenger')).send({ departureId: departure().id, seats: 2 });
    expect(res.body.status).toBe('accepted');
    await runDeparture();
    expect(trip(res.body.tripId).status).toBe('completed');
    expect(db.payout.rows).toHaveLength(0);
    expect(stripe.transfersCreated).toHaveLength(0);
  });

  it('course instantanée : hors du circuit de reversement', async () => {
    const tripId = completedTrip({ source: 'instant' });
    await payouts.onTripCompleted(tripId);
    await payouts.tick();
    expect(db.payout.rows).toHaveLength(0);
  });

  it('bourse, aller-retour payé en une fois : un virement par trajet terminé, sur le même encaissement', async () => {
    const outbound = completedTrip({ totalPriceCents: 9000, commissionCents: 900 });
    const inbound = completedTrip({ totalPriceCents: 9000, commissionCents: 900, paidWithTripId: outbound, status: 'accepted' }, null);

    await payouts.onTripCompleted(outbound);
    await payouts.onTripCompleted(inbound); // le retour n'est pas terminé : rien
    expect(stripe.transfersCreated).toHaveLength(1);
    expect(stripe.transfersCreated[0].params).toMatchObject({ amount: 8100, source_transaction: 'ch_m0' });

    trip(inbound).status = 'completed';
    await payouts.onTripCompleted(inbound);
    expect(stripe.transfersCreated).toHaveLength(2);
    expect(stripe.transfersCreated[1].params).toMatchObject({ amount: 8100, source_transaction: 'ch_m0', destination: 'acct_Djamel' });
  });

  it('jamais plus que ce qui reste encaissé ; tout remboursé = rien à verser', async () => {
    const partly = completedTrip({}, { refundedCents: 10000 }); // 80 € restants pour une part de 162 €
    await payouts.onTripCompleted(partly);
    expect(payoutOf(partly)).toMatchObject({ status: 'paid', amountCents: 8000 });

    const fully = completedTrip({}, { refundedCents: 18000 });
    await payouts.onTripCompleted(fully);
    expect(payoutOf(fully)).toMatchObject({ status: 'void', amountCents: 0 });
    expect(stripe.transfersCreated).toHaveLength(1);
    expect((await mine(DJAMEL)).body.items).toHaveLength(1); // le reversement nul n'est pas affiché
  });

  it('filet de sécurité : une course terminée sans reversement enregistré est rattrapée par le planificateur', async () => {
    const tripId = completedTrip();
    expect(await payouts.tick()).toMatchObject({ registered: 1, paid: 1 });
    expect(payoutOf(tripId)).toMatchObject({ status: 'paid', amountCents: 16200 });
    expect(await payouts.tick()).toMatchObject({ registered: 0, paid: 0 });
    expect(stripe.transfersCreated).toHaveLength(1);
  });

  describe('pénalités d’annulation retenues sur les reversements', () => {
    let seq = 0;
    /** Pénalité de 260 € ; « applied » = délai de contestation passé, due. */
    function penalty(over: Record<string, unknown> = {}) {
      const row = {
        id: id(300 + ++seq), driverId: DJAMEL, cancellationId: id(400 + seq), amountCents: 26000, status: 'applied',
        contestUntil: new Date(Date.now() - HOUR), createdAt: new Date(Date.now() - (100 - seq) * HOUR), collectedCents: 0, collectedAt: null, ...over,
      };
      db.driverPenalty.rows.push(row);
      return db.driverPenalty.rows.find((p: any) => p.id === row.id);
    }
    const deductionsOf = (tripId: string) => db.payoutDeduction.rows.filter((d: any) => d.payoutId === payoutOf(tripId).id);

    afterEach(() => {
      delete process.env.PENALTY_WITHHOLD_PERCENT;
    });

    it('un reversement plus petit que la pénalité est entièrement retenu : aucun virement', async () => {
      const p = penalty();
      const tripId = await paidBooking(); // part de l'opérateur : 45 €
      await runDeparture();
      expect(stripe.transfersCreated).toHaveLength(0);
      expect(payoutOf(tripId)).toMatchObject({ status: 'withheld', grossCents: 4500, withheldCents: 4500, amountCents: 0 });
      expect(p).toMatchObject({ collectedCents: 4500, collectedAt: null });
      expect(deductionsOf(tripId)).toMatchObject([{ penaltyId: p.id, amountCents: 4500 }]);
      const note = db.notification.rows.find((n: any) => n.userId === DJAMEL && n.type === 'payout.withheld');
      expect(note.body).toContain('45,00 €');
      expect(note.body).toContain('Reste dû : 215,00 €');
      expect(db.auditLog.rows.some((l: any) => l.action === 'payout.penalty_withheld' && l.entityId === p.id)).toBe(true);

      const res = await mine(DJAMEL);
      expect(res.body).toMatchObject({ paidCents: 0, pendingCents: 0, withheldCents: 4500 });
      expect(res.body.items[0]).toMatchObject({ status: 'withheld', grossCents: 4500, withheldCents: 4500, amountCents: 0 });
    });

    it('la pénalité se recouvre sur plusieurs reversements, puis les revenus reprennent en entier', async () => {
      const p = penalty();
      const a = completedTrip(); // part : 162 €
      const b = completedTrip();
      const c = completedTrip();
      await payouts.onTripCompleted(a);
      expect(payoutOf(a)).toMatchObject({ status: 'withheld', withheldCents: 16200, amountCents: 0 });
      expect(p.collectedCents).toBe(16200);

      await payouts.onTripCompleted(b);
      // 98 € restaient dus : retenus, le reste (64 €) est viré.
      expect(payoutOf(b)).toMatchObject({ status: 'paid', grossCents: 16200, withheldCents: 9800, amountCents: 6400 });
      expect(p.collectedCents).toBe(26000);
      expect(p.collectedAt).toBeInstanceOf(Date);
      expect(stripe.transfersCreated.map((t) => t.params.amount)).toEqual([6400]);
      const settled = db.notification.rows.filter((n: any) => n.type === 'payout.withheld').at(-1);
      expect(settled.body).toContain('soldée');

      await payouts.onTripCompleted(c);
      expect(payoutOf(c)).toMatchObject({ status: 'paid', withheldCents: 0, amountCents: 16200 });
      // Jamais plus que la pénalité.
      expect(db.payoutDeduction.rows.reduce((s: number, d: any) => s + d.amountCents, 0)).toBe(26000);
    });

    it('rien n’est retenu tant que la pénalité est contestable, contestée ou annulée', async () => {
      const pending = penalty({ status: 'pending', contestUntil: new Date(Date.now() + 5 * 24 * HOUR) });
      const contested = penalty({ status: 'contested' });
      const cancelled = penalty({ status: 'cancelled' });
      const tripId = completedTrip();
      await payouts.onTripCompleted(tripId);
      expect(payoutOf(tripId)).toMatchObject({ status: 'paid', withheldCents: 0, amountCents: 16200 });
      for (const p of [pending, contested, cancelled]) expect(p.collectedCents ?? 0).toBe(0);
      expect(db.payoutDeduction.rows).toHaveLength(0);
    });

    it('la pénalité d’un autre chauffeur ne touche pas mes revenus', async () => {
      const other = penalty({ driverId: KARIM });
      const tripId = completedTrip();
      await payouts.onTripCompleted(tripId);
      expect(payoutOf(tripId)).toMatchObject({ status: 'paid', withheldCents: 0 });
      expect(other.collectedCents ?? 0).toBe(0);
    });

    it('deux pénalités : la plus ancienne est recouvrée d’abord', async () => {
      const old = penalty({ amountCents: 10000 });
      const recent = penalty({ amountCents: 26000 });
      const tripId = completedTrip();
      await payouts.onTripCompleted(tripId);
      expect(old.collectedCents).toBe(10000);
      expect(old.collectedAt).toBeInstanceOf(Date);
      expect(recent).toMatchObject({ collectedCents: 6200, collectedAt: null });
      expect(payoutOf(tripId)).toMatchObject({ status: 'withheld', withheldCents: 16200 });
      expect(deductionsOf(tripId).map((d: any) => d.amountCents)).toEqual([10000, 6200]);
    });

    it('plafond réglable : avec 50 %, la moitié du reversement reste versée', async () => {
      process.env.PENALTY_WITHHOLD_PERCENT = '50';
      const p = penalty();
      const tripId = completedTrip();
      await payouts.onTripCompleted(tripId);
      expect(payoutOf(tripId)).toMatchObject({ status: 'paid', grossCents: 16200, withheldCents: 8100, amountCents: 8100 });
      expect(p.collectedCents).toBe(8100);
      expect(stripe.transfersCreated[0].params.amount).toBe(8100);
    });

    it('traiter deux fois la même fin de course ne retient pas deux fois', async () => {
      const p = penalty();
      const tripId = completedTrip();
      await payouts.onTripCompleted(tripId);
      await payouts.onTripCompleted(tripId);
      await payouts.tick(new Date(Date.now() + 2 * HOUR));
      expect(p.collectedCents).toBe(16200);
      expect(deductionsOf(tripId)).toHaveLength(1);
    });

    it('calcul des retenues interrompu (arrêt du serveur) : repris par le planificateur, sans double retenue', async () => {
      const p = penalty({ amountCents: 5000, collectedCents: 2000 });
      const tripId = completedTrip();
      const paymentId = db.payment.rows.at(-1).id;
      // État laissé par un arrêt en plein calcul : 20 € déjà retenus, montant pas encore fixé.
      const draftId = id(500);
      db.payout.rows.push({
        id: draftId, tripId, driverId: DJAMEL, paymentId, grossCents: 16200, withheldCents: 0, amountCents: 16200, currency: 'EUR', status: 'draft',
        attempts: 0, nextAttemptAt: null, lastError: null, stripeTransferId: null, stripeAccountId: null, createdAt: new Date(Date.now() - 10 * MIN), paidAt: null,
      });
      db.payoutDeduction.rows.push({ id: id(501), payoutId: draftId, penaltyId: p.id, amountCents: 2000, createdAt: new Date() });

      // Tant qu'il est en préparation, rien n'est viré.
      await payouts.onTripCompleted(tripId);
      expect(stripe.transfersCreated).toHaveLength(0);

      await payouts.tick();
      expect(p.collectedCents).toBe(5000);
      expect(payoutOf(tripId)).toMatchObject({ status: 'paid', withheldCents: 5000, amountCents: 11200 });
      expect(stripe.transfersCreated.map((t) => t.params.amount)).toEqual([11200]);
    });
  });

  it('une course annulée ne donne lieu à aucun reversement', async () => {
    const tripId = completedTrip({ status: 'cancelled' });
    await payouts.onTripCompleted(tripId);
    await payouts.tick();
    expect(db.payout.rows).toHaveLength(0);
  });
});
