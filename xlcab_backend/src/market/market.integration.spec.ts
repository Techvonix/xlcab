import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import * as request from 'supertest';
import { AuditModule } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { addDays, localDateOf, zonedToUtc } from '../common/local-time';
import { NotificationsModule } from '../notifications/notifications.service';
import { DEFAULT_OPERATOR_TERMS_VERSION } from '../operators/line-schedule';
import { OperatorsModule } from '../operators/operators.module';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FakeRedis } from '../testing/fake-redis';
import { memoryPrisma } from '../testing/memory-prisma';
import { mfaProof } from '../testing/two-factor-proof';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { MarketModule } from './market.module';
import { MarketService, coarseAddress } from './market.service';

// Bourse de transport, étape 2c (intégration) : scénario B (demande →
// opérateurs compatibles → propositions), scénario C (choix du client →
// reconfirmation de l'opérateur → réservation), confidentialité avant
// confirmation (adresse approximative, messagerie sans coordonnées),
// cloisonnement (scénario H) et échéances.

const JWT_SECRET = 'market-secret';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DJAMEL = id(1);
const CHRIS = id(2);
const NEWBIE = id(3); // chauffeur pas encore vérifié comme opérateur
const PAX = id(11);
const PAX2 = id(12);
const VAN = { djamel: id(21), chris: id(22), newbie: id(23) };
const PARIS = { lat: 48.8781, lng: 2.2834 };
const BEAUVAIS = { lat: 49.4544, lng: 2.1128 };
const MIN = 60_000;
const HOUR = 3600_000;

describe('Bourse : demandes et propositions (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  let market: MarketService;
  const jwt = new JwtService();
  const as = (sub: string, role: string) => `Bearer ${jwt.sign({ sub, role, jti: `j-${sub}` }, { secret: JWT_SECRET })}`;
  const pax = as(PAX, 'passenger');
  const drv = (sub: string) => as(sub, 'driver');
  const admin = { Authorization: as('ops', 'admin'), 'X-2FA-Token': mfaProof(JWT_SECRET, 'ops') };
  const http = () => request(app.getHttpServer());
  const inTwoDays = new Date(Date.now() + 48 * HOUR);
  const notified = (userId: string, type: string) => db.notification.rows.some((n: any) => n.userId === userId && n.type === type);

  const publish = (over: Record<string, unknown> = {}) =>
    http().post('/api/v1/market/requests').set('Authorization', pax).send({
      originAddress: '12 rue de Courcelles, 75017 Paris', originLat: PARIS.lat, originLng: PARIS.lng,
      destinationAddress: 'Aéroport de Beauvais-Tillé', destinationLat: BEAUVAIS.lat, destinationLng: BEAUVAIS.lng,
      departureAt: inTwoDays.toISOString(), flexMin: 30, passengers: 6, luggage: 6, needs: 'Un siège bébé', publish: true, ...over,
    });

  const propose = (who: string, requestId: string, vehicleId: string, priceCents: number, over: Record<string, unknown> = {}) =>
    http().post(`/api/v1/market/requests/${requestId}/offers`).set('Authorization', drv(who)).send({ vehicleId, priceCents, ...over });

  /** Demande publiée et deux propositions : Djamel 180 €, Chris 210 €. */
  async function withOffers() {
    const r = (await publish()).body;
    const d = (await propose(DJAMEL, r.id, VAN.djamel, 18000, { conditions: 'Attente 15 min incluse' })).body;
    const c = (await propose(CHRIS, r.id, VAN.chris, 21000)).body;
    return { requestId: r.id as string, djamelOffer: d.id as string, chrisOffer: c.id as string };
  }

  beforeEach(async () => {
    db = memoryPrisma();
    const approved = new Date('2026-09-01');
    for (const [uid, email, firstName, verified] of [
      [DJAMEL, 'djamel@test.fr', 'Djamel', true], [CHRIS, 'chris@test.fr', 'Chris', true], [NEWBIE, 'new@test.fr', 'Nina', false],
    ] as [string, string, string, boolean][]) {
      db.user.rows.push({ id: uid, email, role: 'driver', firstName, phone: '+33611111111', deletedAt: null });
      db.driverProfile.rows.push({ id: uid, approvedAt: approved, rating: 4.8, ratingCount: 20, totalTrips: 20, languages: ['fr', 'en'] });
      db.operatorProfile.rows.push({
        id: uid, kind: 'independent', status: verified ? 'verified' : 'pending', perSeatAllowed: true, legalName: verified ? `${firstName} Navettes` : null,
        termsAcceptedAt: approved, termsVersion: DEFAULT_OPERATOR_TERMS_VERSION, cities: [], services: [],
      });
    }
    db.vehicle.rows.push(
      { id: VAN.djamel, driverId: DJAMEL, brand: 'Renault', model: 'Trafic', plate: 'AA-111-AA', capacity: 8, pmrEquipped: false, shuttleType: 'bleue', jurisdiction: 'FR' },
      { id: VAN.chris, driverId: CHRIS, brand: 'Mercedes', model: 'Sprinter', plate: 'BB-222-BB', capacity: 13, pmrEquipped: true, shuttleType: 'bleue', jurisdiction: 'FR' },
      { id: VAN.newbie, driverId: NEWBIE, brand: 'Ford', model: 'Transit', plate: 'CC-333-CC', capacity: 8, pmrEquipped: false, shuttleType: 'bleue', jurisdiction: 'FR' },
    );
    db.user.rows.push(
      { id: PAX, email: 'lea@test.fr', role: 'passenger', firstName: 'Léa', phone: '+33622222222', deletedAt: null },
      { id: PAX2, email: 'tom@test.fr', role: 'passenger', firstName: 'Tom', deletedAt: null },
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
        MarketModule,
      ],
    })
      .overrideProvider(TrackingGateway)
      .useValue({ emitTripStatus: jest.fn(), emitToDriver: jest.fn() })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    market = moduleRef.get(MarketService);
  });

  afterEach(() => app.close());

  describe('scénario B — la demande trouve ses opérateurs', () => {
    it('publication : seuls les opérateurs vérifiés au véhicule adapté sont prévenus', async () => {
      const res = await publish();
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ status: 'published', passengers: 6, notifiedOperators: 2 });
      expect(notified(DJAMEL, 'market.request.new') && notified(CHRIS, 'market.request.new')).toBe(true);
      expect(notified(NEWBIE, 'market.request.new')).toBe(false);

      const big = await publish({ passengers: 10 });
      expect(big.body.notifiedOperators).toBe(1); // seul le van de 13 places de Chris
      const pmr = await publish({ passengers: 2, accessible: true });
      expect(pmr.body.notifiedOperators).toBe(1); // seul Chris a un véhicule PMR
    });

    it('fil des opérateurs : ni identité, ni adresse exacte, ni coordonnées précises', async () => {
      const r = (await publish()).body;
      const feed = await http().get('/api/v1/market/feed').set('Authorization', drv(DJAMEL));
      expect(feed.body).toHaveLength(1);
      expect(feed.body[0]).toMatchObject({
        id: r.id,
        origin: { area: '75017 Paris', lat: 48.88, lng: 2.28 },
        destination: { area: 'Aéroport de Beauvais-Tillé' },
        passengers: 6,
        needs: 'Un siège bébé',
        myOffer: null,
      });
      const raw = JSON.stringify(feed.body);
      expect(raw).not.toContain('Courcelles');
      expect(raw).not.toContain(PAX);
      expect(raw).not.toContain('lea@test.fr');
      expect((await http().get('/api/v1/market/feed').set('Authorization', drv(NEWBIE))).body).toEqual([]);
      expect(coarseAddress('Gare du Nord')).toBe('Gare du Nord');
    });

    it('propositions comparables (prix, véhicule, opérateur vérifié), sans plaque ni téléphone', async () => {
      const { requestId } = await withOffers();
      expect(db.transportRequest.rows[0].status).toBe('offers_received');
      expect(notified(PAX, 'market.offer.new')).toBe(true);
      const offers = await http().get(`/api/v1/market/requests/${requestId}/offers`).set('Authorization', pax);
      expect(offers.body.map((o: any) => [o.priceCents, o.operator.name, o.operator.verified, o.vehicle.capacity])).toEqual([
        [18000, 'Djamel Navettes', true, 8],
        [21000, 'Chris Navettes', true, 13],
      ]);
      expect(offers.body[0].conditions).toBe('Attente 15 min incluse');
      const raw = JSON.stringify(offers.body);
      expect(raw).not.toContain('AA-111-AA');
      expect(raw).not.toContain('+336');
    });

    it('les départs de lignes régulières qui répondent déjà à la demande sont proposés au client', async () => {
      const tomorrow = addDays(localDateOf(new Date(), 'Europe/Paris'), 1);
      const line = await http().post('/api/v1/operators/me/lines').set('Authorization', drv(DJAMEL)).send({
        vehicleId: VAN.djamel, originAddress: 'Porte Maillot, Paris', originLat: PARIS.lat, originLng: PARIS.lng,
        destinationAddress: 'Aéroport de Beauvais', destinationLat: BEAUVAIS.lat, destinationLng: BEAUVAIS.lng,
        departureTime: '05:00', daysOfWeek: [1, 2, 3, 4, 5, 6, 7], startDate: tomorrow, seats: 8, luggage: 10, pricingMode: 'per_seat', priceCents: 2500,
      });
      expect(line.status).toBe(201);
      await http().post('/api/v1/operators/me/departures/confirm').set('Authorization', drv(DJAMEL)).send({ until: tomorrow });
      const r = (await publish({ departureAt: zonedToUtc(tomorrow, '05:20', 'Europe/Paris').toISOString(), passengers: 3, luggage: 3 })).body;
      const matches = await http().get(`/api/v1/market/requests/${r.id}/lines`).set('Authorization', pax);
      expect(matches.body).toHaveLength(1);
      expect(matches.body[0]).toMatchObject({ localTime: '05:00', totalPriceCents: 7500 });
    });
  });

  describe('scénario C — choix du client, reconfirmation, réservation', () => {
    it('le client choisit, l’opérateur reconfirme : course créée, autres propositions écartées', async () => {
      const { requestId, djamelOffer, chrisOffer } = await withOffers();
      const accepted = await http().post(`/api/v1/market/offers/${djamelOffer}/accept`).set('Authorization', pax);
      expect(accepted.body).toMatchObject({ status: 'accepted', confirmDeadline: expect.any(String) });
      expect(notified(DJAMEL, 'market.offer.accepted')).toBe(true);
      expect(db.trip.rows).toHaveLength(0); // pas encore de réservation
      expect((await http().post(`/api/v1/market/offers/${chrisOffer}/accept`).set('Authorization', pax)).status).toBe(409);
      expect((await http().get(`/api/v1/market/requests/${requestId}`).set('Authorization', pax)).body.status).toBe('accepted');

      const confirmed = await http().post(`/api/v1/market/offers/${djamelOffer}/confirm`).set('Authorization', drv(DJAMEL));
      expect(confirmed.body).toMatchObject({ status: 'confirmed', tripId: expect.any(String), returnTripId: null });
      const trip = db.trip.rows.find((t: any) => t.id === confirmed.body.tripId);
      expect(trip).toMatchObject({
        source: 'market', status: 'accepted', passengerId: PAX, driverId: DJAMEL, vehicleId: VAN.djamel, totalPriceCents: 18000, commissionCents: 1800,
        originAddress: '12 rue de Courcelles, 75017 Paris',
      });
      expect(db.passengerBooking.rows.find((b: any) => b.tripId === trip.id)).toMatchObject({ seats: 6, notes: 'Un siège bébé' });
      expect(db.transportOffer.rows.find((o: any) => o.id === chrisOffer).status).toBe('rejected');
      const view = await http().get(`/api/v1/market/requests/${requestId}`).set('Authorization', pax);
      expect(view.body).toMatchObject({ status: 'confirmed', tripId: trip.id });
      expect(notified(PAX, 'market.confirmed')).toBe(true);
    });

    it('l’opérateur ne peut finalement pas : la demande se rouvre, le client choisit une autre proposition', async () => {
      const { requestId, djamelOffer, chrisOffer } = await withOffers();
      await http().post(`/api/v1/market/offers/${chrisOffer}/accept`).set('Authorization', pax);
      const declined = await http().post(`/api/v1/market/offers/${chrisOffer}/decline`).set('Authorization', drv(CHRIS));
      expect(declined.body.status).toBe('declined');
      expect(db.transportRequest.rows[0]).toMatchObject({ status: 'offers_received', acceptedOfferId: null });
      expect(notified(PAX, 'market.offer.unconfirmed')).toBe(true);
      expect((await http().post(`/api/v1/market/offers/${djamelOffer}/accept`).set('Authorization', pax)).status).toBe(200);
      expect((await http().get(`/api/v1/market/requests/${requestId}`).set('Authorization', pax)).body.status).toBe('accepted');
    });

    it('pas de reconfirmation dans les 2 h : le choix tombe', async () => {
      const { djamelOffer } = await withOffers();
      await http().post(`/api/v1/market/offers/${djamelOffer}/accept`).set('Authorization', pax);
      const report = await market.tick(new Date(Date.now() + 2 * HOUR + MIN));
      expect(report.expiredOffers).toBeGreaterThanOrEqual(1);
      expect(db.transportOffer.rows.find((o: any) => o.id === djamelOffer).status).toBe('expired');
      expect(db.transportRequest.rows[0].acceptedOfferId).toBeNull();
      expect((await http().post(`/api/v1/market/offers/${djamelOffer}/confirm`).set('Authorization', drv(DJAMEL))).status).toBe(409);
    });

    it('disponibilité revérifiée à la confirmation : opérateur déjà pris sur le créneau', async () => {
      const { djamelOffer } = await withOffers();
      await http().post(`/api/v1/market/offers/${djamelOffer}/accept`).set('Authorization', pax);
      db.trip.rows.push({
        id: id(500), type: 'passenger', status: 'accepted', driverId: DJAMEL, passengerId: PAX2, shuttleType: 'bleue', jurisdiction: 'FR',
        originAddress: 'x', originLat: 0, originLng: 0, destinationAddress: 'y', destinationLat: 0, destinationLng: 0,
        scheduledAt: new Date(inTwoDays.getTime() + 20 * MIN), durationMin: 90, createdAt: new Date(),
      });
      const res = await http().post(`/api/v1/market/offers/${djamelOffer}/confirm`).set('Authorization', drv(DJAMEL));
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Vous avez déjà une course sur ce créneau');
    });

    it('aller-retour : deux courses, prix réparti, adresses inversées au retour', async () => {
      const returnAt = new Date(inTwoDays.getTime() + 8 * HOUR);
      const r = (await publish({ returnAt: returnAt.toISOString() })).body;
      const offer = (await propose(CHRIS, r.id, VAN.chris, 30001, { includesReturn: true })).body;
      await http().post(`/api/v1/market/offers/${offer.id}/accept`).set('Authorization', pax);
      const res = await http().post(`/api/v1/market/offers/${offer.id}/confirm`).set('Authorization', drv(CHRIS));
      const [out, back] = [res.body.tripId, res.body.returnTripId].map((tid: string) => db.trip.rows.find((t: any) => t.id === tid));
      expect([out.totalPriceCents, back.totalPriceCents]).toEqual([15001, 15000]);
      expect(back).toMatchObject({ originAddress: 'Aéroport de Beauvais-Tillé', destinationAddress: '12 rue de Courcelles, 75017 Paris', scheduledAt: returnAt });
    });
  });

  describe('messagerie avant confirmation', () => {
    it('questions et réponses, mais aucune coordonnée tant que rien n’est confirmé', async () => {
      const { djamelOffer, chrisOffer } = await withOffers();
      const ask = await http().post(`/api/v1/market/offers/${djamelOffer}/messages`).set('Authorization', pax).send({ body: 'Avez-vous la place pour une poussette ?' });
      expect(ask.status).toBe(201);
      expect(notified(DJAMEL, 'market.message')).toBe(true);
      for (const body of ['Appelez-moi au 06 12 34 56 78', 'Écrivez à djamel@gmail.com', 'On voit ça sur WhatsApp']) {
        const res = await http().post(`/api/v1/market/offers/${djamelOffer}/messages`).set('Authorization', drv(DJAMEL)).send({ body });
        expect(res.status).toBe(400);
      }
      const thread = await http().get(`/api/v1/market/offers/${djamelOffer}/messages`).set('Authorization', drv(DJAMEL));
      expect(thread.body).toEqual([expect.objectContaining({ mine: false, body: 'Avez-vous la place pour une poussette ?' })]);
      // Ni un autre opérateur ni un autre client ne lisent l'échange.
      expect((await http().get(`/api/v1/market/offers/${djamelOffer}/messages`).set('Authorization', drv(CHRIS))).status).toBe(404);
      expect((await http().get(`/api/v1/market/offers/${chrisOffer}/messages`).set('Authorization', as(PAX2, 'passenger'))).status).toBe(404);
    });
  });

  describe('scénario H et règles', () => {
    it('cloisonnement : un client ne voit pas la demande d’un autre ; un chauffeur ne lit pas les propositions faites à un autre', async () => {
      const { requestId, djamelOffer } = await withOffers();
      const other = as(PAX2, 'passenger');
      expect((await http().get(`/api/v1/market/requests/${requestId}`).set('Authorization', other)).status).toBe(404);
      expect((await http().get(`/api/v1/market/requests/${requestId}/offers`).set('Authorization', other)).status).toBe(404);
      expect((await http().post(`/api/v1/market/offers/${djamelOffer}/accept`).set('Authorization', other)).status).toBe(404);
      expect((await http().post(`/api/v1/market/offers/${djamelOffer}/confirm`).set('Authorization', drv(CHRIS))).status).toBe(404);
      expect((await http().get(`/api/v1/market/requests/${requestId}/offers`).set('Authorization', drv(DJAMEL))).status).toBe(404);
      // Un chauffeur peut demander des devis comme tout voyageur : sa demande vide est refusée pour son contenu, pas pour son rôle.
      expect((await http().post('/api/v1/market/requests').set('Authorization', drv(DJAMEL)).send({})).status).toBe(400);
      expect((await http().get('/api/v1/market/requests').set('Authorization', other)).body).toEqual([]);
    });

    it('opérateur non vérifié, véhicule d’un autre, horaire hors souplesse, double proposition : refusés', async () => {
      const r = (await publish()).body;
      expect((await propose(NEWBIE, r.id, VAN.newbie, 15000)).status).toBe(409);
      expect((await propose(DJAMEL, r.id, VAN.chris, 15000)).status).toBe(404);
      const late = new Date(inTwoDays.getTime() + 2 * HOUR).toISOString();
      expect((await propose(DJAMEL, r.id, VAN.djamel, 15000, { pickupAt: late })).status).toBe(400);
      expect((await propose(DJAMEL, r.id, VAN.djamel, 15000, { includesReturn: true })).status).toBe(400);
      expect((await propose(DJAMEL, r.id, VAN.djamel, 15000)).status).toBe(201);
      expect((await propose(DJAMEL, r.id, VAN.djamel, 14000)).status).toBe(409);
      const offer = db.transportOffer.rows[0];
      await http().post(`/api/v1/market/offers/${offer.id}/withdraw`).set('Authorization', drv(DJAMEL));
      expect(db.transportRequest.rows[0].status).toBe('published');
      expect((await propose(DJAMEL, r.id, VAN.djamel, 14000)).status).toBe(201); // nouvelle proposition après retrait
    });

    it('dates : au moins 2 h à l’avance, retour après l’aller ; brouillon publié ensuite', async () => {
      expect((await publish({ departureAt: new Date(Date.now() + HOUR).toISOString() })).status).toBe(400);
      expect((await publish({ returnAt: new Date(inTwoDays.getTime() - HOUR).toISOString() })).status).toBe(400);
      const draft = await publish({ publish: false });
      expect(draft.body.status).toBe('draft');
      expect((await http().get('/api/v1/market/feed').set('Authorization', drv(DJAMEL))).body).toEqual([]);
      const pub = await http().post(`/api/v1/market/requests/${draft.body.id}/publish`).set('Authorization', pax);
      expect(pub.body.status).toBe('published');
      expect((await http().post(`/api/v1/market/requests/${draft.body.id}/publish`).set('Authorization', pax)).status).toBe(409);
    });

    it('annulation par le client : propositions écartées, opérateurs prévenus', async () => {
      const { requestId } = await withOffers();
      const res = await http().post(`/api/v1/market/requests/${requestId}/cancel`).set('Authorization', pax);
      expect(res.body.status).toBe('cancelled');
      expect(db.transportOffer.rows.every((o: any) => o.status === 'rejected')).toBe(true);
      expect(notified(DJAMEL, 'market.request.cancelled')).toBe(true);
      expect((await http().get('/api/v1/market/feed').set('Authorization', drv(DJAMEL))).body).toEqual([]);
    });

    it('échéance une heure avant le départ sans réservation : demande expirée, client prévenu', async () => {
      await withOffers();
      const report = await market.tick(new Date(inTwoDays.getTime() - 59 * MIN));
      expect(report.expiredRequests).toBe(1);
      expect(db.transportRequest.rows[0].status).toBe('expired');
      expect(db.transportOffer.rows.every((o: any) => o.status === 'expired')).toBe(true);
      expect(notified(PAX, 'market.request.expired')).toBe(true);
    });

    it('pas de bourse réelle en production avant Stripe Connect', async () => {
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        expect((await publish()).status).toBe(503);
      } finally {
        process.env.NODE_ENV = previous;
      }
    });

    it('suivi par l’équipe XLCAB (2FA) : demandes à surveiller signalées', async () => {
      await publish({ departureAt: new Date(Date.now() + 5 * HOUR).toISOString() });
      expect((await http().get('/api/v1/admin/market/requests').set('Authorization', as('ops', 'admin'))).status).toBe(403);
      const res = await http().get('/api/v1/admin/market/requests').set(admin);
      expect(res.body.items[0]).toMatchObject({ requesterEmail: 'lea@test.fr', offers: 0, needsAttention: true });
    });
  });
});
