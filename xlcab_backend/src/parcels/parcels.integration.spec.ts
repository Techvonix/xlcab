import { Global, INestApplication, Module, ServiceUnavailableException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.service';
import { NotificationsModule } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { STRIPE_CLIENT } from '../payments/stripe.provider';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { RoutingService } from '../bookings/routing.service';
import { DocumentStorage } from '../drivers/document-storage';
import { MatchingService } from '../matching/matching.service';
import { TripsModule } from '../trips/trips.module';
import { DriverModeModule } from '../driver-mode/driver-mode.module';
import { FakeRedis } from '../testing/fake-redis';
import { FakeStripe } from '../testing/fake-stripe';
import { FakeStorage, JPEG } from '../testing/drivers-fakes';
import { memoryPrisma } from '../testing/memory-prisma';
import { ParcelsModule } from './parcels.module';
import { ParcelsService } from './parcels.service';

// Module Colis de bout en bout via HTTP : devis (navette partagée à
// l'aller ou au retour, ou navette dédiée), prépaiement Stripe, checklist
// du chauffeur, enlèvement (QR), remise (code + photo), annulations et
// remboursements. Base, Redis, Stripe, Google et stockage simulés.

const JWT_SECRET = 'parcels-secret';
const CARRIER = '7a1e0000-0000-4000-8000-0000000000c1';
const HOUR = 3600_000;
const PARIS = { lat: 48.8443, lng: 2.3744 };
const ROUEN = { lat: 49.4488, lng: 1.0942 };
const inMs = (ms: number) => new Date(Date.now() + ms);

describe('Colis (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  let redis: FakeRedis;
  let stripe: FakeStripe;
  let storage: FakeStorage;
  const jwt = new JwtService();
  const as = (sub: string, role = 'passenger') => `Bearer ${jwt.sign({ sub, role, jti: `j-${sub}` }, { secret: JWT_SECRET })}`;
  const sender = () => as('s1');
  const driver = () => as('d1', 'driver');
  const http = () => request(app.getHttpServer());
  const trip = (id: string) => db.trip.rows.find((t: any) => t.id === id);
  const parcel = (id: string) => db.parcelBooking.rows.find((p: any) => p.id === id);

  /** Course passager Paris → Rouen acceptée par d1, départ dans [ms]. */
  function seedCarrier(ms = 3 * HOUR, extra: object = {}) {
    db.trip.rows.push({
      id: CARRIER, type: 'passenger', status: 'accepted', passengerId: 'p1', driverId: 'd1', vehicleId: 'v1', shuttleType: 'bleue',
      originAddress: 'Gare de Lyon, Paris', originLat: PARIS.lat, originLng: PARIS.lng,
      destinationAddress: 'Gare de Rouen', destinationLat: ROUEN.lat, destinationLng: ROUEN.lng,
      scheduledAt: inMs(ms), durationMin: 97, totalPriceCents: 12186, vatCents: 0, jurisdiction: 'FR', corporateId: null,
      acceptedAt: new Date(), createdAt: new Date(), ...extra,
    });
  }

  const body = (over: object = {}) => ({
    pickup: { lat: PARIS.lat + 0.005, lng: PARIS.lng },
    delivery: { lat: ROUEN.lat, lng: ROUEN.lng + 0.01 },
    scheduledAt: inMs(2.5 * HOUR).toISOString(),
    weightKg: 5,
    lengthCm: 40,
    widthCm: 30,
    heightCm: 20,
    ...over,
  });
  const booking = (over: object = {}) => ({
    ...body(),
    mode: 'grafted',
    pickupAddress: '10 rue de Lyon, Paris',
    deliveryAddress: '5 rue Jeanne d’Arc, Rouen',
    description: 'Carton de livres',
    recipientName: 'Marc Petit',
    recipientPhone: '06 12 34 56 78',
    prohibitedItemsDeclined: true,
    ...over,
  });
  /** Retour Rouen → Paris. */
  const reverse = () => ({ pickup: { lat: ROUEN.lat, lng: ROUEN.lng + 0.01 }, delivery: { lat: PARIS.lat + 0.005, lng: PARIS.lng }, scheduledAt: inMs(4 * HOUR).toISOString() });
  const returnBooking = (over: object = {}) => booking({ ...reverse(), ...over });
  /** Réserver se fait au moins 2 h avant le départ : on rapproche ensuite la course. */
  const departSoon = () => Object.assign(trip(CARRIER), { scheduledAt: inMs(30 * 60_000) });

  /** Réserve puis paie (webhook simulé par /payments/confirm). */
  async function bookAndPay(payload: object) {
    const res = await http().post('/api/v1/bookings/parcel').set('Authorization', sender()).send(payload);
    expect(res.status).toBe(201);
    const pay = db.payment.rows.find((p: any) => p.tripId === res.body.tripId);
    stripe.succeed(pay.stripePaymentIntentId);
    await http().post('/api/v1/payments/confirm').set('Authorization', sender()).send({ tripId: res.body.tripId });
    return res.body as { parcelId: string; tripId: string; onReturnLeg: boolean; departureAt: string };
  }

  const deliver = (id: string, code: string, photo = true) => {
    const req = http().post(`/api/v1/bookings/parcel/${id}/deliver`).set('Authorization', driver()).field('code', code);
    return photo ? req.attach('photo', JPEG, 'remise.jpg') : req;
  };

  beforeEach(async () => {
    db = memoryPrisma();
    redis = new FakeRedis();
    stripe = new FakeStripe();
    storage = new FakeStorage();
    db.user.rows.push(
      { id: 's1', email: 'lea@x.fr', role: 'passenger', jurisdiction: 'FR', deletedAt: null, firstName: 'Léa', phone: '+33611111111' },
      { id: 'p1', email: 'paul@x.fr', role: 'passenger', jurisdiction: 'FR', deletedAt: null },
      { id: 'd1', email: 'nadia@x.fr', role: 'driver', jurisdiction: 'FR', deletedAt: null, firstName: 'Nadia' },
    );
    db.driverProfile.rows.push({ id: 'd1', totalTrips: 10, approvedAt: new Date(), documentsVerified: true, rating: 4.9 });
    db.vehicle.rows.push({ id: 'v1', driverId: 'd1', plate: 'AB-123-CD', dashcamActive: true });

    @Global()
    @Module({
      providers: [
        { provide: PrismaService, useValue: db },
        { provide: RedisService, useValue: redis },
      ],
      exports: [PrismaService, RedisService],
    })
    class FakeInfraModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ JWT_SECRET, JWT_REFRESH_SECRET: 'r', STRIPE_WEBHOOK_SECRET: 'w' })] }),
        FakeInfraModule,
        AuditModule,
        NotificationsModule,
        AuthModule,
        ParcelsModule,
        TripsModule,
        DriverModeModule,
      ],
    })
      .overrideProvider(STRIPE_CLIENT).useValue(stripe)
      .overrideProvider(TrackingGateway).useValue({ emitTripStatus: jest.fn(), emitToDriver: jest.fn() })
      .overrideProvider(RoutingService).useValue({ drivingRoute: jest.fn().mockResolvedValue({ distanceKm: 135.4, durationMin: 97 }) })
      .overrideProvider(DocumentStorage).useValue(storage)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterEach(() => app.close());

  describe('devis', () => {
    it('itinéraire incalculable : navette dédiée indisponible, devis rendu quand même', async () => {
      (app.get(RoutingService).drivingRoute as jest.Mock).mockRejectedValueOnce(new ServiceUnavailableException('Calcul d’itinéraire momentanément indisponible'));
      const res = await http().post('/api/v1/bookings/parcel/quote').set('Authorization', sender()).send(body());
      expect(res.status).toBe(200);
      expect(res.body.dedicated).toMatchObject({ available: false });
    });

    it('place de ligne ou de bourse : jamais porteuse d’un colis greffé (les colis y ont leurs emplacements)', async () => {
      seedCarrier(3 * HOUR, { source: 'line' });
      const res = await http().post('/api/v1/bookings/parcel/quote').set('Authorization', sender()).send(body());
      expect(res.body.grafted).toMatchObject({ available: false });
    });

    it('navette partagée (forfait 8 € HT + TVA 20 %) et navette dédiée (tarif km)', async () => {
      seedCarrier();
      const res = await http().post('/api/v1/bookings/parcel/quote').set('Authorization', sender()).send(body());

      expect(res.status).toBe(200);
      expect(res.body.grafted).toMatchObject({ available: true, onReturnLeg: false, quote: { priceCents: 800, vatCents: 160, totalCents: 960 } });
      // 135,4 km × 0,90 € + 8 € = 129,86 € HT ; TVA 20 % = 25,97 €.
      expect(res.body.dedicated).toMatchObject({ available: true, quote: { priceCents: 12986, vatCents: 2597, totalCents: 15583 } });
    });

    it('sans navette prévue : seule la navette dédiée est proposée, avec la raison', async () => {
      const res = await http().post('/api/v1/bookings/parcel/quote').set('Authorization', sender()).send(body());
      expect(res.body.grafted).toMatchObject({ available: false, reason: expect.stringContaining('Aucune navette') });
      expect(res.body.dedicated.available).toBe(true);
    });

    it('limites : 30 kg, 120 × 80 × 80 cm (dans n’importe quel sens), 2 h à l’avance', async () => {
      const q = (over: object) => http().post('/api/v1/bookings/parcel/quote').set('Authorization', sender()).send(body(over));
      expect((await q({ weightKg: 31 })).status).toBe(400);
      expect((await q({ lengthCm: 130 })).body.message).toContain('120 × 80 × 80');
      expect((await q({ lengthCm: 80, widthCm: 120, heightCm: 80 })).status).toBe(200); // tourné
      expect((await q({ scheduledAt: inMs(HOUR).toISOString() })).body.message).toContain('2 h');
    });

    it('navette PMR et courses d’entreprise ne transportent pas de colis', async () => {
      seedCarrier(3 * HOUR, { shuttleType: 'accessibility' });
      const res = await http().post('/api/v1/bookings/parcel/quote').set('Authorization', sender()).send(body());
      expect(res.body.grafted.available).toBe(false);
    });
  });

  describe('colis à l’aller (avec des passagers)', () => {
    it('payé : rattaché à la course, jamais dispatché seul', async () => {
      seedCarrier();
      const b = await bookAndPay(booking());
      expect(trip(b.tripId)).toMatchObject({ type: 'parcel', status: 'attached', totalPriceCents: 960 });
      expect(parcel(b.parcelId)).toMatchObject({ carrierTripId: CARRIER, onReturnLeg: false, status: 'pending' });
    });

    it('capacité : 3 colis par course passager au plus', async () => {
      seedCarrier();
      for (let i = 0; i < 3; i++) await bookAndPay(booking());
      const res = await http().post('/api/v1/bookings/parcel').set('Authorization', sender()).send(booking());
      expect(res.status).toBe(409);
      expect(res.body.message).toContain('navette dédiée');
    });

    it('parcours chauffeur : checklist, QR à l’enlèvement, transit au départ, code + photo à la remise, revenus', async () => {
      seedCarrier();
      const b = await bookAndPay(booking());
      departSoon();
      const code = parcel(b.parcelId).deliveryCode;
      const qr = parcel(b.parcelId).qrCode;

      // Checklist : le chauffeur voit le colis, jamais le code ni le QR.
      const missions = await http().get('/api/v1/drivers/me/trips').set('Authorization', driver());
      expect(missions.body.upcoming[0].parcels).toEqual([
        expect.objectContaining({ id: b.parcelId, description: 'Carton de livres', onReturnLeg: false, recipient: { name: 'Marc Petit', phone: '0612345678' } }),
      ]);
      expect(JSON.stringify(missions.body)).not.toContain(code === '0000' ? 'impossible' : `"${code}"`);
      expect(JSON.stringify(missions.body)).not.toContain(qr);

      expect((await http().post(`/api/v1/bookings/parcel/${b.parcelId}/pickup`).set('Authorization', driver()).send({ qrCode: 'faux' })).status).toBe(400);
      const pick = await http().post(`/api/v1/bookings/parcel/${b.parcelId}/pickup`).set('Authorization', driver()).send({ qrCode: qr });
      expect(pick.body.status).toBe('picked_up');

      // Fin de course impossible avec un colis à bord.
      await http().post(`/api/v1/trips/${CARRIER}/start`).set('Authorization', driver()).send({});
      expect(parcel(b.parcelId).status).toBe('in_transit');
      expect((await http().post(`/api/v1/trips/${CARRIER}/complete`).set('Authorization', driver())).status).toBe(409);

      const wrong = code === '0000' ? '1111' : '0000';
      const bad = await deliver(b.parcelId, wrong);
      expect(bad.status).toBe(400);
      expect(bad.body.message).toContain('4 essai(s) restant(s)');
      expect((await deliver(b.parcelId, code, false)).status).toBe(400); // photo obligatoire

      const ok = await deliver(b.parcelId, code);
      expect(ok.body.status).toBe('delivered');
      expect(parcel(b.parcelId).proofOfDeliveryKey).toMatch(/^proof-/);
      expect(trip(b.tripId)).toMatchObject({ status: 'completed', driverId: 'd1' });
      expect((await http().post(`/api/v1/trips/${CARRIER}/complete`).set('Authorization', driver())).status).toBe(200);

      // Le colis compte dans les revenus : 8 € HT − 10 % = 7,20 € net.
      const earnings = await http().get('/api/v1/drivers/me/earnings').set('Authorization', driver());
      expect(earnings.body.today).toMatchObject({ trips: 2, grossCents: 12186 + 960, exVatCents: 12186 + 800 });
    });

    it('code de remise deviné : bloqué après 5 essais', async () => {
      seedCarrier();
      const b = await bookAndPay(booking());
      Object.assign(departSoon(), { status: 'started' });
      await http().post(`/api/v1/bookings/parcel/${b.parcelId}/pickup`).set('Authorization', driver()).send({ qrCode: parcel(b.parcelId).qrCode });
      const wrong = parcel(b.parcelId).deliveryCode === '0000' ? '1111' : '0000';
      for (let i = 0; i < 5; i++) await deliver(b.parcelId, wrong);
      expect((await deliver(b.parcelId, parcel(b.parcelId).deliveryCode)).status).toBe(429);
    });

    it('enlèvement trop tôt (plus d’1 h avant le départ) refusé', async () => {
      seedCarrier(3 * HOUR);
      const b = await bookAndPay(booking());
      const res = await http().post(`/api/v1/bookings/parcel/${b.parcelId}/pickup`).set('Authorization', driver()).send({ qrCode: parcel(b.parcelId).qrCode });
      expect(res.status).toBe(409);
    });

    it('colis jamais remis au départ : signalé (incident), les passagers partent quand même', async () => {
      seedCarrier();
      const b = await bookAndPay(booking());
      departSoon();
      const start = await http().post(`/api/v1/trips/${CARRIER}/start`).set('Authorization', driver()).send({});
      expect(start.status).toBe(200);
      expect(parcel(b.parcelId)).toMatchObject({ status: 'failed', failureReason: expect.stringContaining('non remis') });
      expect(db.incident.rows[0]).toMatchObject({ type: 'parcel_failed' });
    });

    it('course passager annulée : colis annulé et remboursé intégralement', async () => {
      seedCarrier();
      const b = await bookAndPay(booking());
      await http().post(`/api/v1/trips/${CARRIER}/cancel`).set('Authorization', as('p1')).send({ reason: 'Imprévu' });
      expect(parcel(b.parcelId).status).toBe('cancelled');
      expect(trip(b.tripId).status).toBe('cancelled');
      expect(stripe.refundsCreated.find((r) => r.params.metadata.tripId === b.tripId)?.params.amount).toBe(960);
    });

    it('l’expéditeur annule avant l’enlèvement, plus après', async () => {
      seedCarrier();
      const a = await bookAndPay(booking());
      expect((await http().post(`/api/v1/trips/${a.tripId}/cancel`).set('Authorization', sender()).send({ reason: 'Plus besoin' })).status).toBe(200);
      expect(parcel(a.parcelId).status).toBe('cancelled');

      const b = await bookAndPay(booking());
      departSoon();
      await http().post(`/api/v1/bookings/parcel/${b.parcelId}/pickup`).set('Authorization', driver()).send({ qrCode: parcel(b.parcelId).qrCode });
      const late = await http().post(`/api/v1/trips/${b.tripId}/cancel`).set('Authorization', sender()).send({ reason: 'Plus besoin' });
      expect(late.status).toBe(409);
    });
  });

  describe('colis au retour (le chauffeur ne rentre pas à vide)', () => {
    it('devis : le trajet retour Rouen → Paris d’un chauffeur engagé est proposé', async () => {
      seedCarrier();
      const res = await http().post('/api/v1/bookings/parcel/quote').set('Authorization', sender()).send(body(reverse()));
      expect(res.body.grafted).toMatchObject({ available: true, onReturnLeg: true });
      // Départ retour estimé : aller (+3 h) + 97 min + 30 min.
      const expected = trip(CARRIER).scheduledAt.getTime() + (97 + 30) * 60_000;
      expect(new Date(res.body.grafted.departureAt).getTime()).toBe(expected);
    });

    it('pas de retour sans chauffeur attribué', async () => {
      seedCarrier(3 * HOUR, { status: 'searching', driverId: null });
      const res = await http().post('/api/v1/bookings/parcel/quote').set('Authorization', sender()).send(body(reverse()));
      expect(res.body.grafted.available).toBe(false);
    });

    it('parcours complet : chauffeur prévenu, course aller terminée, enlèvement à l’arrivée, remise au départ', async () => {
      seedCarrier();
      const b = await bookAndPay(returnBooking());
      departSoon();
      expect(parcel(b.parcelId).onReturnLeg).toBe(true);
      expect(db.notification.rows.some((n: any) => n.userId === 'd1' && n.type === 'parcel.return_added')).toBe(true);

      // Pas d'enlèvement avant d'être arrivé.
      const early = await http().post(`/api/v1/bookings/parcel/${b.parcelId}/pickup`).set('Authorization', driver()).send({ qrCode: parcel(b.parcelId).qrCode });
      expect(early.status).toBe(409);

      // La course aller démarre et se termine sans être bloquée par le colis du retour.
      await http().post(`/api/v1/trips/${CARRIER}/start`).set('Authorization', driver()).send({});
      expect(parcel(b.parcelId).status).toBe('pending');
      expect((await http().post(`/api/v1/trips/${CARRIER}/complete`).set('Authorization', driver())).status).toBe(200);

      // La mission reste affichée (étape retour) tant que le colis n'est pas remis.
      let missions = await http().get('/api/v1/drivers/me/trips').set('Authorization', driver());
      expect(missions.body.upcoming[0]).toMatchObject({ id: CARRIER, status: 'completed', parcels: [expect.objectContaining({ onReturnLeg: true })] });

      const pick = await http().post(`/api/v1/bookings/parcel/${b.parcelId}/pickup`).set('Authorization', driver()).send({ qrCode: parcel(b.parcelId).qrCode });
      expect(pick.body.status).toBe('in_transit');
      expect((await deliver(b.parcelId, parcel(b.parcelId).deliveryCode)).body.status).toBe('delivered');

      missions = await http().get('/api/v1/drivers/me/trips').set('Authorization', driver());
      expect(missions.body.upcoming).toEqual([]);
    });

    it('le chauffeur ne rentre pas par ce trajet : colis annulé et remboursé', async () => {
      seedCarrier();
      const b = await bookAndPay(returnBooking());
      const res = await http().post(`/api/v1/bookings/parcel/${b.parcelId}/fail`).set('Authorization', driver()).send({ reason: 'Je reste à Rouen ce soir' });
      expect(res.body.status).toBe('cancelled');
      expect(stripe.refundsCreated.some((r) => r.params.metadata.tripId === b.tripId)).toBe(true);
    });

    it('désistement du chauffeur : les colis de son retour sont remboursés', async () => {
      seedCarrier(5 * HOUR);
      const b = await bookAndPay(returnBooking({ scheduledAt: inMs(6 * HOUR).toISOString() }));
      await http().post(`/api/v1/trips/${CARRIER}/cancel`).set('Authorization', driver()).send({ reason: 'Panne' });
      expect(parcel(b.parcelId).status).toBe('cancelled');
    });

    it('colis jamais récupéré 6 h après l’arrivée : annulé par le planificateur', async () => {
      seedCarrier();
      const b = await bookAndPay(returnBooking());
      Object.assign(trip(CARRIER), { status: 'completed', completedAt: new Date(Date.now() - 7 * HOUR) });
      const released = await app.get(ParcelsService).releaseStranded();
      expect(released).toBe(1);
      expect(parcel(b.parcelId).status).toBe('cancelled');
    });

    it('passagers prioritaires au retour : une course Rouen → Paris reste proposée au chauffeur et reprend ses colis', async () => {
      seedCarrier();
      const b = await bookAndPay(returnBooking());
      const matching = app.get(MatchingService);
      const backAt = new Date(trip(CARRIER).scheduledAt.getTime() + 127 * 60_000);

      // Course ailleurs sur le créneau du retour : chauffeur occupé.
      const elsewhere = { origin: ROUEN, destination: { lat: 49.18, lng: -0.37 } }; // Caen
      expect((await matching.busyDrivers(['d1'], backAt, 90, elsewhere)).has('d1')).toBe(true);
      // Course qui suit son retour : proposable.
      const back = { origin: ROUEN, destination: PARIS };
      expect((await matching.busyDrivers(['d1'], backAt, 90, back)).has('d1')).toBe(false);

      // Il l'accepte : les colis du retour montent dans cette course.
      const RETURN_TRIP = '7a1e0000-0000-4000-8000-0000000000c2';
      db.trip.rows.push({
        id: RETURN_TRIP, type: 'passenger', status: 'accepted', passengerId: 'p1', driverId: 'd1', shuttleType: 'bleue',
        originLat: ROUEN.lat, originLng: ROUEN.lng, destinationLat: PARIS.lat, destinationLng: PARIS.lng,
        scheduledAt: backAt, durationMin: 97, corporateId: null,
      });
      expect(await matching.transferReturnParcels('d1', RETURN_TRIP)).toBe(1);
      expect(parcel(b.parcelId)).toMatchObject({ carrierTripId: RETURN_TRIP, onReturnLeg: false });
    });
  });

  describe('navette dédiée', () => {
    it('payée : dispatchée comme une course ; démarrage seulement après le scan du colis', async () => {
      const b = await bookAndPay(booking({ mode: 'dedicated' }));
      expect(trip(b.tripId)).toMatchObject({ type: 'parcel', shuttleType: 'bleue', totalPriceCents: 15583 });
      expect(['searching', 'no_driver']).toContain(trip(b.tripId).status); // départ < 3 h : recherche lancée

      Object.assign(trip(b.tripId), { status: 'accepted', driverId: 'd1', vehicleId: 'v1', scheduledAt: inMs(30 * 60_000) });
      const blocked = await http().post(`/api/v1/trips/${b.tripId}/start`).set('Authorization', driver()).send({});
      expect(blocked.status).toBe(409);
      expect(blocked.body.message).toContain('Scannez le QR du colis');

      await http().post(`/api/v1/bookings/parcel/${b.parcelId}/pickup`).set('Authorization', driver()).send({ qrCode: parcel(b.parcelId).qrCode });
      expect((await http().post(`/api/v1/trips/${b.tripId}/start`).set('Authorization', driver()).send({})).status).toBe(200);
      expect(parcel(b.parcelId).status).toBe('in_transit');
    });
  });

  describe('suivi par l’expéditeur (écran 12)', () => {
    it('timeline, QR et code de remise réservés à l’expéditeur', async () => {
      seedCarrier();
      const b = await bookAndPay(booking());
      const res = await http().get(`/api/v1/bookings/parcel/${b.parcelId}`).set('Authorization', sender());
      expect(res.body).toMatchObject({
        status: 'pending', mode: 'grafted', onReturnLeg: false, cancellable: true,
        qrCode: parcel(b.parcelId).qrCode, deliveryCode: parcel(b.parcelId).deliveryCode,
        driver: { firstName: 'Nadia', vehicle: expect.objectContaining({ plate: 'AB-123-CD' }) },
      });
      expect((await http().get(`/api/v1/bookings/parcel/${b.parcelId}`).set('Authorization', as('p1'))).status).toBe(404);

      const history = await http().get('/api/v1/bookings/parcel/history').set('Authorization', sender());
      expect(history.body).toEqual([expect.objectContaining({ id: b.parcelId, description: 'Carton de livres' })]);
    });

    it('photo du colis : image seulement, avant l’enlèvement', async () => {
      seedCarrier();
      const b = await bookAndPay(booking());
      const ok = await http().post(`/api/v1/bookings/parcel/${b.parcelId}/photo`).set('Authorization', sender()).attach('photo', JPEG, 'colis.jpg');
      expect(ok.status).toBe(201);
      expect(storage.files.size).toBe(1);
      const pdf = await http().post(`/api/v1/bookings/parcel/${b.parcelId}/photo`).set('Authorization', sender()).attach('photo', Buffer.from('%PDF-1.7'), 'x.pdf');
      expect(pdf.status).toBe(400);
    });

    it('déclaration d’absence d’objets interdits obligatoire', async () => {
      seedCarrier();
      const res = await http().post('/api/v1/bookings/parcel').set('Authorization', sender()).send(booking({ prohibitedItemsDeclined: false }));
      expect(res.status).toBe(400);
    });
  });
});
