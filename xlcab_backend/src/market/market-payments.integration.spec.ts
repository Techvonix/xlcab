import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import * as request from 'supertest';
import { AuditModule } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.service';
import { DEFAULT_OPERATOR_TERMS_VERSION } from '../operators/line-schedule';
import { OperatorsModule } from '../operators/operators.module';
import { STRIPE_CLIENT } from '../payments/stripe.provider';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FakeRedis } from '../testing/fake-redis';
import { FakeStripe } from '../testing/fake-stripe';
import { memoryPrisma } from '../testing/memory-prisma';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { TripsModule } from '../trips/trips.module';
import { MarketModule } from './market.module';
import { MarketService } from './market.service';

// Stripe Connect, étape 3 (vrai HTTP ; base, Redis et Stripe simulés) :
// sur la bourse, la carte du client est AUTORISÉE quand il choisit une
// proposition, débitée quand l'opérateur confirme, libérée sinon.

const JWT_SECRET = 'market-payments-secret';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DJAMEL = id(1);
const CHRIS = id(2);
const NOPAYOUT = id(3); // opérateur vérifié sans compte de versement
const PAX = id(11);
const PAX2 = id(12);
const VAN = { djamel: id(21), chris: id(22), nopayout: id(23) };
const MIN = 60_000;
const HOUR = 3600_000;

describe('Bourse : empreinte de carte et débit à la confirmation (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  let stripe: FakeStripe;
  let market: MarketService;
  const jwt = new JwtService();
  const as = (sub: string, role: string) => `Bearer ${jwt.sign({ sub, role, jti: `j-${sub}` }, { secret: JWT_SECRET })}`;
  const pax = as(PAX, 'passenger');
  const drv = (sub: string) => as(sub, 'driver');
  const http = () => request(app.getHttpServer());
  const inTwoDays = new Date(Date.now() + 48 * HOUR);
  const notified = (userId: string, type: string) => db.notification.rows.filter((n: any) => n.userId === userId && n.type === type).length;
  const offer = (offerId: string) => db.transportOffer.rows.find((o: any) => o.id === offerId);
  const request_ = (requestId: string) => db.transportRequest.rows.find((r: any) => r.id === requestId);
  const paymentOf = (offerId: string) => db.payment.rows.filter((p: any) => p.offerId === offerId).at(-1);

  const publish = (over: Record<string, unknown> = {}) =>
    http().post('/api/v1/market/requests').set('Authorization', pax).send({
      originAddress: '12 rue de Courcelles, 75017 Paris', originLat: 48.8781, originLng: 2.2834,
      destinationAddress: 'Aéroport de Beauvais-Tillé', destinationLat: 49.4544, destinationLng: 2.1128,
      departureAt: inTwoDays.toISOString(), flexMin: 30, passengers: 6, luggage: 6, publish: true, ...over,
    });
  const propose = (who: string, requestId: string, vehicleId: string, priceCents: number, over: Record<string, unknown> = {}) =>
    http().post(`/api/v1/market/requests/${requestId}/offers`).set('Authorization', drv(who)).send({ vehicleId, priceCents, ...over });
  const accept = (offerId: string, auth = pax) => http().post(`/api/v1/market/offers/${offerId}/accept`).set('Authorization', auth);
  const authorize = (offerId: string, auth = pax) => http().post(`/api/v1/market/offers/${offerId}/authorize`).set('Authorization', auth);
  const confirm = (who: string, offerId: string) => http().post(`/api/v1/market/offers/${offerId}/confirm`).set('Authorization', drv(who));

  /** Demande publiée et deux propositions : Djamel 180 €, Chris 210 €. */
  async function withOffers(over: Record<string, unknown> = {}, offerOver: Record<string, unknown> = {}) {
    const r = (await publish(over)).body;
    const d = await propose(DJAMEL, r.id, VAN.djamel, 18000, offerOver);
    expect(d.status).toBe(201);
    const c = (await propose(CHRIS, r.id, VAN.chris, 21000)).body;
    return { requestId: r.id as string, djamelOffer: d.body.id as string, chrisOffer: c.id as string };
  }

  /** Le client choisit la proposition et valide son empreinte de carte dans la feuille de paiement. */
  async function chooseAndAuthorize(offerId: string) {
    const chosen = await accept(offerId);
    expect(chosen.status).toBe(200);
    stripe.authorize(paymentOf(offerId).stripePaymentIntentId);
    const res = await authorize(offerId);
    expect(res.status).toBe(200);
    return res;
  }

  beforeEach(async () => {
    process.env.LINE_PAYMENT_MODE = 'connect';
    db = memoryPrisma();
    stripe = new FakeStripe();
    const approved = new Date('2026-09-01');
    for (const [uid, email, firstName, payout] of [
      [DJAMEL, 'djamel@test.fr', 'Djamel', true], [CHRIS, 'chris@test.fr', 'Chris', true], [NOPAYOUT, 'nina@test.fr', 'Nina', false],
    ] as [string, string, string, boolean][]) {
      db.user.rows.push({ id: uid, email, role: 'driver', firstName, phone: '+33611111111', deletedAt: null });
      db.driverProfile.rows.push({ id: uid, approvedAt: approved, rating: 4.8, ratingCount: 20, totalTrips: 20, languages: ['fr', 'en'] });
      db.operatorProfile.rows.push({
        id: uid, kind: 'independent', status: 'verified', perSeatAllowed: true, legalName: `${firstName} Navettes`,
        termsAcceptedAt: approved, termsVersion: DEFAULT_OPERATOR_TERMS_VERSION, cities: [], services: [],
      });
      if (payout) {
        db.payoutAccount.rows.push({ userId: uid, stripeAccountId: `acct_${firstName}`, detailsSubmitted: true, payoutsEnabled: true, transfersActive: true, requirementsDue: 0 });
      }
    }
    db.vehicle.rows.push(
      { id: VAN.djamel, driverId: DJAMEL, brand: 'Renault', model: 'Trafic', plate: 'AA-111-AA', capacity: 8, pmrEquipped: false, shuttleType: 'bleue', jurisdiction: 'FR', dashcamActive: true },
      { id: VAN.chris, driverId: CHRIS, brand: 'Mercedes', model: 'Sprinter', plate: 'BB-222-BB', capacity: 13, pmrEquipped: true, shuttleType: 'bleue', jurisdiction: 'FR', dashcamActive: true },
      { id: VAN.nopayout, driverId: NOPAYOUT, brand: 'Ford', model: 'Transit', plate: 'CC-333-CC', capacity: 8, pmrEquipped: false, shuttleType: 'bleue', jurisdiction: 'FR', dashcamActive: true },
    );
    db.user.rows.push(
      { id: PAX, email: 'lea@test.fr', role: 'passenger', firstName: 'Léa', phone: '+33622222222', deletedAt: null, stripeCustomerId: null },
      { id: PAX2, email: 'tom@test.fr', role: 'passenger', firstName: 'Tom', deletedAt: null, stripeCustomerId: null },
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
        TripsModule,
        MarketModule,
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
    market = moduleRef.get(MarketService);
  });

  afterEach(async () => {
    delete process.env.LINE_PAYMENT_MODE;
    await app.close();
  });

  it('un opérateur sans compte de versement ne peut pas proposer', async () => {
    const r = (await publish()).body;
    const res = await propose(NOPAYOUT, r.id, VAN.nopayout, 15000);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PAYOUT_ACCOUNT_REQUIRED');
    expect(db.transportOffer.rows).toHaveLength(0);
  });

  it('choisir une proposition demande une empreinte de carte : rien n’est débité, l’opérateur n’est pas encore prévenu', async () => {
    const { requestId, djamelOffer } = await withOffers();
    const res = await accept(djamelOffer);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ offerId: djamelOffer, status: 'authorizing' });
    expect(res.body.payment).toMatchObject({ offerId: djamelOffer, amountCents: 18000, currency: 'EUR' });
    expect(new Date(res.body.authorizeDeadline).getTime()).toBeLessThanOrEqual(Date.now() + 15 * MIN + 1000);

    // Capture manuelle : la carte sera seulement autorisée. Montant fixé par le serveur.
    expect(stripe.intentCreates[0].params).toMatchObject({ amount: 18000, currency: 'eur', capture_method: 'manual', metadata: { offerId: djamelOffer, userId: PAX } });
    expect(paymentOf(djamelOffer)).toMatchObject({ status: 'requires_payment', amountCents: 18000, userId: PAX });
    expect(request_(requestId)).toMatchObject({ status: 'accepted', acceptedOfferId: djamelOffer });
    expect(notified(DJAMEL, 'market.offer.accepted')).toBe(0);
    // Pour l'opérateur, sa proposition est toujours « en attente ».
    const mine = await http().get('/api/v1/market/my-offers').set('Authorization', drv(DJAMEL));
    expect(mine.body[0]).toMatchObject({ status: 'pending', confirmDeadline: null });
  });

  it('rouvrir la feuille de paiement reprend la même empreinte', async () => {
    const { djamelOffer } = await withOffers();
    const first = await accept(djamelOffer);
    const again = await accept(djamelOffer);
    expect(again.status).toBe(200);
    expect(again.body.payment.paymentIntentClientSecret).toBe(first.body.payment.paymentIntentClientSecret);
    expect(stripe.intentCreates).toHaveLength(1);
    expect(db.payment.rows).toHaveLength(1);
  });

  it('tant que la carte n’est pas autorisée, le choix n’est pas validé', async () => {
    const { djamelOffer } = await withOffers();
    await accept(djamelOffer);
    const res = await authorize(djamelOffer);
    expect(res.status).toBe(409);
    expect(offer(djamelOffer).status).toBe('authorizing');
    // L'opérateur ne peut pas confirmer une proposition dont la carte n'est pas autorisée.
    expect((await confirm(DJAMEL, djamelOffer)).status).toBe(409);
    expect(stripe.captured).toHaveLength(0);
  });

  it('carte autorisée : l’opérateur est prévenu et dispose de 2 heures', async () => {
    const { djamelOffer } = await withOffers();
    const res = await chooseAndAuthorize(djamelOffer);
    expect(res.body.status).toBe('accepted');
    expect(new Date(res.body.confirmDeadline).getTime()).toBeGreaterThan(Date.now() + 110 * MIN);
    expect(paymentOf(djamelOffer).status).toBe('authorized');
    expect(notified(DJAMEL, 'market.offer.accepted')).toBe(1);
    // Appel répété (app + planificateur) : une seule notification.
    await authorize(djamelOffer);
    await market.tick();
    expect(notified(DJAMEL, 'market.offer.accepted')).toBe(1);
    expect(stripe.captured).toHaveLength(0);
  });

  it('une empreinte d’un autre montant ne valide pas le choix', async () => {
    const { djamelOffer } = await withOffers();
    await accept(djamelOffer);
    Object.assign(stripe.intents.get(paymentOf(djamelOffer).stripePaymentIntentId), { status: 'requires_capture', amount_capturable: 100 });
    expect((await authorize(djamelOffer)).status).toBe(409);
  });

  it('l’opérateur confirme : la carte est débitée et la course créée', async () => {
    const { requestId, djamelOffer, chrisOffer } = await withOffers();
    await chooseAndAuthorize(djamelOffer);
    const res = await confirm(DJAMEL, djamelOffer);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'confirmed', returnTripId: null });

    expect(stripe.captured).toHaveLength(1);
    const trip = db.trip.rows.find((t: any) => t.id === res.body.tripId);
    expect(trip).toMatchObject({ status: 'accepted', source: 'market', driverId: DJAMEL, passengerId: PAX, totalPriceCents: 18000, paidWithTripId: null });
    expect(paymentOf(djamelOffer)).toMatchObject({ status: 'succeeded', tripId: trip.id, amountCents: 18000 });
    expect(request_(requestId).status).toBe('confirmed');
    expect(offer(chrisOffer).status).toBe('rejected');
    // Confirmer deux fois ne débite pas deux fois.
    expect((await confirm(DJAMEL, djamelOffer)).status).toBe(409);
    expect(stripe.captured).toHaveLength(1);
  });

  it('aller-retour : un seul débit pour les deux courses', async () => {
    const back = new Date(inTwoDays.getTime() + 8 * HOUR);
    const { djamelOffer } = await withOffers({ returnAt: back.toISOString() }, { includesReturn: true });
    await chooseAndAuthorize(djamelOffer);
    const res = await confirm(DJAMEL, djamelOffer);
    expect(res.status).toBe(200);
    expect(res.body.returnTripId).toBeTruthy();
    expect(stripe.captured).toHaveLength(1);
    expect(db.payment.rows).toHaveLength(1);
    const outbound = db.trip.rows.find((t: any) => t.id === res.body.tripId);
    const inbound = db.trip.rows.find((t: any) => t.id === res.body.returnTripId);
    expect(outbound.totalPriceCents + inbound.totalPriceCents).toBe(18000);
    expect(inbound.paidWithTripId).toBe(outbound.id);
    expect(paymentOf(djamelOffer).tripId).toBe(outbound.id);
  });

  it('aller-retour : annuler le retour ne rembourse que la part du retour, puis l’aller la sienne', async () => {
    const back = new Date(inTwoDays.getTime() + 8 * HOUR);
    const { djamelOffer } = await withOffers({ returnAt: back.toISOString() }, { includesReturn: true });
    await chooseAndAuthorize(djamelOffer);
    const { body } = await confirm(DJAMEL, djamelOffer);
    const cancel = (tripId: string) => http().post(`/api/v1/trips/${tripId}/cancel`).set('Authorization', pax).send({ reason: 'Changement de programme' });

    const inbound = await cancel(body.returnTripId);
    expect(inbound.status).toBe(200);
    expect(inbound.body.refundedCents).toBe(9000 - inbound.body.feeCents);
    expect(paymentOf(djamelOffer).refundedCents).toBe(inbound.body.refundedCents);

    const outbound = await cancel(body.tripId);
    expect(outbound.status).toBe(200);
    expect(outbound.body.refundedCents).toBe(9000 - outbound.body.feeCents);
    // Jamais plus que ce qui a été payé.
    expect(paymentOf(djamelOffer).refundedCents).toBe(inbound.body.refundedCents + outbound.body.refundedCents);
    expect(paymentOf(djamelOffer).refundedCents).toBeLessThanOrEqual(18000);
    expect(stripe.refundsCreated).toHaveLength(2);
  });

  it('l’opérateur décline : l’empreinte est levée, rien n’est débité, la demande se rouvre', async () => {
    const { requestId, djamelOffer, chrisOffer } = await withOffers();
    await chooseAndAuthorize(djamelOffer);
    const res = await http().post(`/api/v1/market/offers/${djamelOffer}/decline`).set('Authorization', drv(DJAMEL));
    expect(res.status).toBe(200);
    expect(stripe.canceled).toEqual([paymentOf(djamelOffer).stripePaymentIntentId]);
    expect(paymentOf(djamelOffer).status).toBe('canceled');
    expect(stripe.captured).toHaveLength(0);
    expect(request_(requestId)).toMatchObject({ status: 'offers_received', acceptedOfferId: null });
    // Le client peut choisir l'autre proposition : nouvelle empreinte.
    const next = await accept(chrisOffer);
    expect(next.body).toMatchObject({ status: 'authorizing', payment: { amountCents: 21000 } });
  });

  it('l’opérateur ne confirme pas dans les 2 heures : empreinte levée par le planificateur', async () => {
    const { requestId, djamelOffer } = await withOffers();
    await chooseAndAuthorize(djamelOffer);
    await market.tick(new Date(Date.now() + 121 * MIN));
    expect(offer(djamelOffer).status).toBe('expired');
    expect(paymentOf(djamelOffer).status).toBe('canceled');
    expect(stripe.captured).toHaveLength(0);
    expect(request_(requestId).acceptedOfferId).toBeNull();
    expect(notified(PAX, 'market.offer.unconfirmed')).toBe(1);
  });

  it('empreinte abandonnée : au bout de 15 minutes la proposition redevient disponible', async () => {
    const { requestId, djamelOffer, chrisOffer } = await withOffers();
    await accept(djamelOffer);
    // Pendant ce temps, une autre proposition ne peut pas être choisie.
    expect((await accept(chrisOffer)).status).toBe(409);
    await market.tick(new Date(Date.now() + 14 * MIN));
    expect(offer(djamelOffer).status).toBe('authorizing');

    await market.tick(new Date(Date.now() + 16 * MIN));
    expect(offer(djamelOffer)).toMatchObject({ status: 'pending', confirmDeadline: null });
    expect(paymentOf(djamelOffer).status).toBe('canceled');
    expect(request_(requestId)).toMatchObject({ status: 'offers_received', acceptedOfferId: null });
    expect(notified(DJAMEL, 'market.offer.accepted')).toBe(0);
    // Le client peut la choisir de nouveau : une nouvelle empreinte, pas l'ancienne annulée.
    const again = await accept(djamelOffer);
    expect(again.status).toBe(200);
    expect(stripe.intentCreates).toHaveLength(2);
    expect(stripe.intentCreates[1].options.idempotencyKey).not.toBe(stripe.intentCreates[0].options.idempotencyKey);
  });

  it('carte validée mais app fermée avant de le signaler : le planificateur valide le choix', async () => {
    const { djamelOffer } = await withOffers();
    await accept(djamelOffer);
    stripe.authorize(paymentOf(djamelOffer).stripePaymentIntentId);
    await market.tick(new Date(Date.now() + 16 * MIN));
    expect(offer(djamelOffer).status).toBe('accepted');
    expect(paymentOf(djamelOffer).status).toBe('authorized');
    expect(notified(DJAMEL, 'market.offer.accepted')).toBe(1);
  });

  it('débit refusé par la banque à la confirmation : aucune course, le client est invité à choisir de nouveau', async () => {
    const { requestId, djamelOffer } = await withOffers();
    await chooseAndAuthorize(djamelOffer);
    stripe.failNextCapture = true;
    const res = await confirm(DJAMEL, djamelOffer);
    expect(res.status).toBe(409);
    expect(db.trip.rows).toHaveLength(0);
    expect(offer(djamelOffer).status).toBe('expired');
    expect(paymentOf(djamelOffer).status).toBe('canceled');
    expect(request_(requestId)).toMatchObject({ status: 'offers_received', acceptedOfferId: null });
    expect(notified(PAX, 'market.offer.unconfirmed')).toBe(1);
    expect(db.auditLog.rows.some((l: any) => l.action === 'payment.capture_failed')).toBe(true);
  });

  it('le client annule sa demande pendant l’attente de l’opérateur : empreinte levée', async () => {
    const { requestId, djamelOffer } = await withOffers();
    await chooseAndAuthorize(djamelOffer);
    const res = await http().post(`/api/v1/market/requests/${requestId}/cancel`).set('Authorization', pax);
    expect(res.status).toBe(200);
    expect(paymentOf(djamelOffer).status).toBe('canceled');
    expect(stripe.captured).toHaveLength(0);
    expect((await confirm(DJAMEL, djamelOffer)).status).toBe(409);
  });

  it('demande arrivée à échéance : empreinte levée', async () => {
    const { requestId, djamelOffer } = await withOffers();
    await chooseAndAuthorize(djamelOffer);
    // Le délai de l'opérateur est borné par l'échéance de la demande.
    request_(requestId).expiresAt = new Date(Date.now() + 30 * MIN);
    offer(djamelOffer).confirmDeadline = new Date(Date.now() + 30 * MIN);
    await market.tick(new Date(Date.now() + 31 * MIN));
    expect(paymentOf(djamelOffer).status).toBe('canceled');
    expect(request_(requestId).acceptedOfferId === null || request_(requestId).status === 'expired').toBe(true);
    expect(stripe.captured).toHaveLength(0);
  });

  it('la proposition d’un autre client ne peut être ni choisie ni validée par moi', async () => {
    const { djamelOffer } = await withOffers();
    const other = as(PAX2, 'passenger');
    expect((await accept(djamelOffer, other)).status).toBe(404);
    await accept(djamelOffer);
    expect((await authorize(djamelOffer, other)).status).toBe(404);
  });

  it('Stripe en panne au moment du choix : le choix est défait, le client peut réessayer', async () => {
    const { requestId, djamelOffer } = await withOffers();
    const create = stripe.paymentIntents.create;
    stripe.paymentIntents.create = async () => {
      throw new Error('Stripe API indisponible');
    };
    expect((await accept(djamelOffer)).status).toBe(500);
    expect(offer(djamelOffer).status).toBe('pending');
    expect(request_(requestId).acceptedOfferId).toBeNull();
    stripe.paymentIntents.create = create;
    expect((await accept(djamelOffer)).status).toBe(200);
  });
});
