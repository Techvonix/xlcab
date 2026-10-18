import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import * as request from 'supertest';
import { AuditModule } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { addDays, localDateOf } from '../common/local-time';
import { NotificationsModule } from '../notifications/notifications.service';
import { DEFAULT_OPERATOR_TERMS_VERSION } from '../operators/line-schedule';
import { LinesService } from '../operators/lines.service';
import { OperatorsModule } from '../operators/operators.module';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FakeRedis } from '../testing/fake-redis';
import { MeetingPointsModule } from '../meeting-points/meeting-points';
import { memoryPrisma } from '../testing/memory-prisma';
import { FakeStorage, JPEG } from '../testing/drivers-fakes';
import { DocumentStorage } from '../drivers/document-storage';
import { mfaProof } from '../testing/two-factor-proof';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { DepartureThresholdService } from './departure-threshold';
import { LineBookingsModule } from './line-bookings.module';

// Seuil de départ garanti (CLARIFICATION_MODELE.md, section 4.5 ; décisions
// D2 à D4 du 2026-10-14), en intégration (vrai HTTP, base et Redis simulés) :
// Sami publie Lyon → Limoges, 7 places, « je pars d'office dès 4 passagers ».

const JWT_SECRET = 'threshold-secret';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SAMI = id(1);
const OTHER = id(2); // autre opérateur
const THOMAS = id(11);
const LEA = id(12);
const NINA = id(13);
const VAN = id(21);
const LYON = { lat: 45.7606, lng: 4.8594 };
const LIMOGES = { lat: 45.8336, lng: 1.2611 };
const MIN = 60_000;

describe('Seuil de départ garanti (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  let threshold: DepartureThresholdService;
  let lines: LinesService;
  const jwt = new JwtService();
  const as = (sub: string, role: string) => `Bearer ${jwt.sign({ sub, role, jti: `j-${sub}` }, { secret: JWT_SECRET })}`;
  const http = () => request(app.getHttpServer());
  const tomorrow = addDays(localDateOf(new Date(), 'Europe/Paris'), 1);
  let lineId: string;

  const departure = () => db.lineDeparture.rows.find((d: any) => d.lineId === lineId && d.localDate === tomorrow);
  const tripsOf = (depId: string) => db.trip.rows.filter((t: any) => t.lineDepartureId === depId);
  const notifications = (userId: string, type: string) => db.notification.rows.filter((n: any) => n.userId === userId && n.type === type).length;

  function moveDeparture(minutes: number) {
    const at = new Date(Date.now() + minutes * MIN);
    departure().departureAt = at;
    for (const t of tripsOf(departure().id)) t.scheduledAt = at;
  }

  const book = (pax: string, seats: number) =>
    http().post('/api/v1/lines/bookings').set('Authorization', as(pax, 'passenger')).send({ departureId: departure().id, seats });
  const search = () =>
    http().get('/api/v1/lines/search').set('Authorization', as(NINA, 'passenger')).query({
      fromLat: LYON.lat, fromLng: LYON.lng, toLat: LIMOGES.lat, toLng: LIMOGES.lng, date: tomorrow, seats: 1,
    });
  const createLine = (extra: Record<string, unknown>) =>
    http().post('/api/v1/operators/me/lines').set('Authorization', as(SAMI, 'driver')).send({
      vehicleId: VAN,
      originAddress: 'Gare de Lyon Part-Dieu', originLat: LYON.lat, originLng: LYON.lng,
      destinationAddress: 'Gare de Limoges-Bénédictins', destinationLat: LIMOGES.lat, destinationLng: LIMOGES.lng,
      departureTime: '08:00', daysOfWeek: [1, 2, 3, 4, 5, 6, 7], startDate: tomorrow, seats: 7, luggage: 7,
      pricingMode: 'per_seat', priceCents: 3000, durationMin: 270,
      ...extra,
    });

  beforeEach(async () => {
    db = memoryPrisma();
    const approved = new Date('2026-09-01');
    for (const [uid, firstName] of [[SAMI, 'Sami'], [OTHER, 'Chris']]) {
      db.user.rows.push({ id: uid, email: `${firstName}@test.fr`, role: 'driver', firstName, phone: '+33611111111', deletedAt: null });
      db.driverProfile.rows.push({ id: uid, approvedAt: approved, rating: 4.9, ratingCount: 10, totalTrips: 10, languages: ['fr'] });
      db.operatorProfile.rows.push({
        id: uid, kind: 'independent', status: 'verified', perSeatAllowed: true, transportLicense: 'LOTI-1',
        termsAcceptedAt: approved, termsVersion: DEFAULT_OPERATOR_TERMS_VERSION, cities: [], services: [],
      });
    }
    db.vehicle.rows.push({
      id: VAN, driverId: SAMI, brand: 'Renault', model: 'Trafic', plate: 'AA-001-AA', capacity: 8, dashcamActive: true, shuttleType: 'bleue', jurisdiction: 'FR',
    });
    db.user.rows.push({ id: 'ops', email: 'ops@xlcab.com', role: 'admin', deletedAt: null });
    for (const [uid, firstName] of [[THOMAS, 'Thomas'], [LEA, 'Léa'], [NINA, 'Nina']]) {
      db.user.rows.push({ id: uid, email: `${firstName}@test.fr`, role: 'passenger', firstName, deletedAt: null });
    }

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
        MeetingPointsModule,
      ],
    })
      .overrideProvider(TrackingGateway)
      .useValue({ emitTripStatus: jest.fn(), emitToDriver: jest.fn() })
      .overrideProvider(DocumentStorage)
      .useValue(new FakeStorage())
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    threshold = moduleRef.get(DepartureThresholdService);
    lines = moduleRef.get(LinesService);

    const created = await createLine({ minPassengers: 4 });
    expect(created.status).toBe(201);
    expect(created.body.minPassengers).toBe(4);
    lineId = created.body.id;
    await http().post('/api/v1/operators/me/departures/confirm').set('Authorization', as(SAMI, 'driver')).send({ lineId, until: tomorrow });
    moveDeparture(30 * 60); // demain, bien avant l'échéance de 24 h
  });

  afterEach(async () => {
    await app.close();
  });

  it('seuil refusé s’il dépasse les places ou sur un véhicule privatisé', async () => {
    expect((await createLine({ minPassengers: 8 })).status).toBe(400);
    expect((await createLine({ minPassengers: 3, pricingMode: 'per_vehicle', priceCents: 39000 })).status).toBe(400);
    expect((await createLine({ minPassengers: 0 })).status).toBe(400);
  });

  it('départ confirmé mais pas garanti : la recherche dit combien de passagers manquent et jusqu’à quand', async () => {
    expect(departure()).toMatchObject({ status: 'open', minPassengers: 4, guaranteedAt: null });
    const res = await search();
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].guarantee).toMatchObject({ minPassengers: 4, guaranteed: false, missed: false, missingPassengers: 4 });
    expect(new Date(res.body[0].guarantee.deadline).getTime()).toBe(departure().departureAt.getTime() - 24 * 3600_000);
  });

  it('seuil atteint : départ garanti, « Départ confirmé » aux passagers et top départ au chauffeur, une seule fois', async () => {
    const first = await book(THOMAS, 3);
    expect(first.status).toBe(201);
    expect(first.body.guarantee).toMatchObject({ guaranteed: false, minPassengers: 4 });
    expect(departure().guaranteedAt).toBeNull();

    const trip = await http().get(`/api/v1/trips/${first.body.tripId}`).set('Authorization', as(THOMAS, 'passenger'));
    expect(trip.body.lineGuarantee).toMatchObject({ guaranteed: false, minPassengers: 4, deadline: expect.any(String) });

    const second = await book(LEA, 1);
    expect(second.body.guarantee).toMatchObject({ guaranteed: true, deadline: null });
    expect(departure().guaranteedAt).toBeInstanceOf(Date);
    expect(notifications(THOMAS, 'line.guaranteed')).toBe(1);
    expect(notifications(LEA, 'line.guaranteed')).toBe(1);
    expect(notifications(SAMI, 'line.guaranteed.driver')).toBe(1);

    // Les places restantes se vendent toujours ; pas de second « top départ ».
    expect((await book(NINA, 2)).status).toBe(201);
    expect(notifications(SAMI, 'line.guaranteed.driver')).toBe(1);
    expect((await search()).body[0].guarantee).toMatchObject({ guaranteed: true, missingPassengers: 0, deadline: null });
  });

  it('seuil non atteint 24 h avant : départ annulé, réservations remboursées sans frais, aucune pénalité', async () => {
    await book(THOMAS, 2);
    await book(LEA, 1);
    moveDeparture(23 * 60);

    const report = await threshold.tick();
    expect(report).toEqual({ released: 1, cancelledBookings: 2 });
    expect(departure()).toMatchObject({ status: 'closed', seatsBooked: 0, guaranteedAt: null, thresholdMissedAt: expect.any(Date) });
    for (const t of tripsOf(departure().id)) {
      expect(t).toMatchObject({ status: 'cancelled', cancellationFeeCents: 0 });
    }
    expect(db.lineSeat.rows.filter((s: any) => s.departureId === departure().id)).toHaveLength(0);
    expect(notifications(THOMAS, 'line.threshold_missed')).toBe(1);
    expect(notifications(LEA, 'line.threshold_missed')).toBe(1);
    expect(notifications(SAMI, 'line.threshold_missed.driver')).toBe(1);
    expect(db.driverCancellation.rows).toHaveLength(0);
    expect(db.driverPenalty.rows).toHaveLength(0);

    // Plus en vente, et ne se rouvre pas.
    expect((await search()).body).toHaveLength(0);
    const reopen = await http().patch(`/api/v1/operators/me/departures/${departure().id}`).set('Authorization', as(SAMI, 'driver')).send({ closed: false });
    expect(reopen.status).toBe(409);
    expect((await threshold.tick()).released).toBe(0); // un seul passage
  });

  it('après l’échéance, un départ non garanti ne se vend plus, même avant le passage du planificateur', async () => {
    moveDeparture(20 * 60);
    expect((await search()).body).toHaveLength(0);
    expect((await book(THOMAS, 1)).status).toBe(409);
  });

  it('échéance réglable par pays (configuration de la juridiction)', async () => {
    db.jurisdictionConfig.rows.find((c: any) => c.code === 'FR').lineThresholdDeadlineHours = 48;
    moveDeparture(60 * 60);
    expect((await book(THOMAS, 1)).status).toBe(201);
    moveDeparture(40 * 60);
    expect((await threshold.tick()).released).toBe(1);
  });

  it('annulation par le passager : gratuite tant que le départ n’est pas confirmé, frais des CGV ensuite', async () => {
    // Pays à échéance courte (6 h) : un départ non garanti peut exister à moins de 24 h.
    db.jurisdictionConfig.rows.find((c: any) => c.code === 'FR').lineThresholdDeadlineHours = 6;
    moveDeparture(10 * 60);
    const thomas = await book(THOMAS, 2);
    const cancel = (pax: string, tripId: string) =>
      http().post(`/api/v1/trips/${tripId}/cancel`).set('Authorization', as(pax, 'passenger')).send({ reason: 'Changement de programme' });
    const free = await cancel(THOMAS, thomas.body.tripId);
    expect(free.status).toBe(200);
    expect(free.body.feeCents).toBe(0);

    await book(LEA, 4); // seuil atteint : départ confirmé
    expect(departure().guaranteedAt).toBeInstanceOf(Date);
    const nina = await book(NINA, 1);
    const paid = await cancel(NINA, nina.body.tripId);
    expect(paid.body.feeCents).toBe(1500); // 50 % entre 24 h et 2 h
  });

  it('« Je pars quand même » : le chauffeur garantit son départ sous le seuil, les passagers sont prévenus', async () => {
    await book(THOMAS, 2);
    expect((await http().post(`/api/v1/operators/me/departures/${departure().id}/guarantee`).set('Authorization', as(OTHER, 'driver'))).status).toBe(404);

    const res = await http().post(`/api/v1/operators/me/departures/${departure().id}/guarantee`).set('Authorization', as(SAMI, 'driver'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ guaranteed: true, guarantee: { guaranteed: true } });
    expect(notifications(THOMAS, 'line.guaranteed')).toBe(1);

    moveDeparture(23 * 60);
    expect((await threshold.tick()).released).toBe(0);
    expect(tripsOf(departure().id)[0].status).toBe('accepted');
  });

  it('chauffeur qui se retire avant le seuil : réservations annulées et remboursées, ni secours ni pénalité', async () => {
    await book(THOMAS, 2);
    const res = await http().post(`/api/v1/operators/me/departures/${departure().id}/cancel`).set('Authorization', as(SAMI, 'driver')).send({ reason: 'Pas assez de monde' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rescue: false, released: true, cancelledBookings: 1 });
    expect(tripsOf(departure().id)[0]).toMatchObject({ status: 'cancelled', cancellationFeeCents: 0 });
    expect(departure().rescueStatus).toBe('none');
    expect(db.driverCancellation.rows).toHaveLength(0);
    expect(db.incident.rows).toHaveLength(0);
  });

  it('chauffeur qui se retire APRÈS le seuil : protocole de secours habituel (annulation enregistrée)', async () => {
    await book(THOMAS, 3);
    await book(LEA, 1);
    expect(departure().guaranteedAt).toBeInstanceOf(Date);
    const res = await http().post(`/api/v1/operators/me/departures/${departure().id}/cancel`).set('Authorization', as(SAMI, 'driver')).send({ reason: 'Malade' });
    expect(res.body).toMatchObject({ rescue: true });
    expect(departure().rescueStatus).toBe('searching');
    expect(db.driverCancellation.rows).toHaveLength(1);
  });

  it('ligne sans seuil : départ garanti dès sa confirmation (comportement inchangé)', async () => {
    const created = await createLine({ departureTime: '14:00' });
    await http().post('/api/v1/operators/me/departures/confirm').set('Authorization', as(SAMI, 'driver')).send({ lineId: created.body.id, until: tomorrow });
    const d = db.lineDeparture.rows.find((x: any) => x.lineId === created.body.id && x.localDate === tomorrow);
    expect(d).toMatchObject({ status: 'open', minPassengers: null, guaranteedAt: expect.any(Date) });
  });

  it('seuil modifié sur la ligne : appliqué aux départs sans réservation, figé sur ceux déjà réservés', async () => {
    await book(THOMAS, 1);
    const after = addDays(tomorrow, 1);
    const res = await http().patch(`/api/v1/operators/me/lines/${lineId}`).set('Authorization', as(SAMI, 'driver')).send({ minPassengers: null });
    expect(res.status).toBe(200);
    expect(res.body.minPassengers).toBeNull();
    expect(departure()).toMatchObject({ minPassengers: 4, guaranteedAt: null }); // réservé : figé
    const next = db.lineDeparture.rows.find((x: any) => x.lineId === lineId && x.localDate === after);
    expect(next.minPassengers).toBeNull();
  });

  // ── Étape 2 : départ ponctuel ───────────────────────────────────────

  describe('départ ponctuel (« je pars le …, il me reste N places »)', () => {
    const inTwoDays = addDays(tomorrow, 1);
    const publish = (extra: Record<string, unknown> = {}) =>
      http().post('/api/v1/operators/me/departures').set('Authorization', as(SAMI, 'driver')).send({
        vehicleId: VAN,
        originAddress: 'Gare de Lyon Part-Dieu', originLat: LYON.lat, originLng: LYON.lng,
        destinationAddress: 'Gare de Limoges-Bénédictins', destinationLat: LIMOGES.lat, destinationLng: LIMOGES.lng,
        date: inTwoDays, departureTime: '09:30', seats: 3, luggage: 3, pricingMode: 'per_seat', priceCents: 3500, durationMin: 270,
        ...extra,
      });

    it('publié et mis en vente en un geste ; trouvé et réservé comme un départ de ligne', async () => {
      const res = await publish();
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ kind: 'one_off', startDate: inTwoDays, endDate: inTwoDays, seats: 3 });
      expect(res.body.departure).toMatchObject({ status: 'open', seatsTotal: 3, guaranteed: true, minPassengers: null });

      const found = await http().get('/api/v1/lines/search').set('Authorization', as(NINA, 'passenger')).query({
        fromLat: LYON.lat, fromLng: LYON.lng, toLat: LIMOGES.lat, toLng: LIMOGES.lng, date: inTwoDays, seats: 2,
      });
      const result = found.body.find((r: any) => r.departureId === res.body.departure.id);
      expect(result).toMatchObject({ localTime: '09:30', seatsLeft: 3, unitPriceCents: 3500, totalPriceCents: 7000 });

      const booked = await http().post('/api/v1/lines/bookings').set('Authorization', as(THOMAS, 'passenger'))
        .send({ departureId: res.body.departure.id, seats: 2 });
      expect(booked.status).toBe(201);
      expect(booked.body).toMatchObject({ status: 'accepted', totalPriceCents: 7000 });
    });

    it('avec un seuil : en attente de passagers, comme une ligne', async () => {
      const res = await publish({ minPassengers: 2 });
      expect(res.status).toBe(201);
      expect(res.body.departure).toMatchObject({ guaranteed: false, minPassengers: 2, thresholdDeadline: expect.any(String) });
    });

    it('refusé : passé, trop proche, trop lointain, seuil sans le temps de l’atteindre', async () => {
      const today = localDateOf(new Date(), 'Europe/Paris');
      expect((await publish({ date: addDays(today, -1) })).status).toBe(400);
      expect((await publish({ date: addDays(today, 31) })).status).toBe(400);
      const soon = new Date(Date.now() + 30 * MIN).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
      const soonDate = new Date(Date.now() + 30 * MIN).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
      expect((await publish({ date: soonDate, departureTime: soon })).status).toBe(400);

      // Dans 10 h : sans seuil, accepté ; avec un seuil (échéance 24 h), refusé.
      const later = new Date(Date.now() + 10 * 60 * MIN);
      const at = { date: later.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }), departureTime: later.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }) };
      const withThreshold = await publish({ ...at, minPassengers: 2 });
      expect(withThreshold.status).toBe(400);
      expect(withThreshold.body.message).toContain('24 h');
      expect((await publish(at)).status).toBe(201);
    });

    it('sa date ne se modifie pas ; clos par la passe quotidienne une fois le jour passé', async () => {
      const res = await publish();
      const patch = await http().patch(`/api/v1/operators/me/lines/${res.body.id}`).set('Authorization', as(SAMI, 'driver')).send({ daysOfWeek: [1, 2] });
      expect(patch.status).toBe(400);
      expect((await http().patch(`/api/v1/operators/me/lines/${res.body.id}`).set('Authorization', as(SAMI, 'driver')).send({ priceCents: 3000 })).status).toBe(200);

      await lines.syncAll(new Date(Date.now() + 4 * 24 * 3600_000));
      expect(db.recurringLine.rows.find((l: any) => l.id === res.body.id)).toMatchObject({ status: 'closed' });
      expect(db.lineDeparture.rows.filter((d: any) => d.lineId === res.body.id)).toHaveLength(1); // historique gardé
    });
  });

  // ── Étape 3 : points de rencontre, arrêts, prix par tronçon ─────────

  describe('points de rencontre et arrêts', () => {
    const CLERMONT = { lat: 45.7786, lng: 3.0816 };
    const admin = { Authorization: as('ops', 'admin'), 'X-2FA-Token': mfaProof(JWT_SECRET, 'ops') };
    const inTwoDays = addDays(tomorrow, 1);
    let clermontId: string;

    const addPoint = (body: Record<string, unknown>) => http().post('/api/v1/admin/meeting-points').set(admin).send(body);
    const publish = (extra: Record<string, unknown> = {}) =>
      http().post('/api/v1/operators/me/departures').set('Authorization', as(SAMI, 'driver')).send({
        vehicleId: VAN,
        originAddress: 'Gare de Lyon Part-Dieu', originLat: LYON.lat, originLng: LYON.lng,
        destinationAddress: 'Gare de Limoges-Bénédictins', destinationLat: LIMOGES.lat, destinationLng: LIMOGES.lng,
        date: inTwoDays, departureTime: '09:30', seats: 7, luggage: 7, pricingMode: 'per_seat', priceCents: 3000, durationMin: 270,
        stops: [{ meetingPointId: clermontId, offsetMin: 150, fareFromOriginCents: 1800 }],
        ...extra,
      });
    const searchFrom = (from: { lat: number; lng: number }, to: { lat: number; lng: number }, seats = 1) =>
      http().get('/api/v1/lines/search').set('Authorization', as(NINA, 'passenger')).query({
        fromLat: from.lat, fromLng: from.lng, toLat: to.lat, toLng: to.lng, date: inTwoDays, seats,
      });

    beforeEach(async () => {
      const res = await addPoint({
        city: 'Clermont-Ferrand', name: 'Gare routière', address: 'Gare routière, Clermont-Ferrand', lat: CLERMONT.lat, lng: CLERMONT.lng,
        instructions: 'Quai 4, devant l’abri vitré', transit: 'Tram A — arrêt Gaillard',
      });
      expect(res.status).toBe(201);
      clermontId = res.body.id;
    });

    it('catalogue tenu par l’équipe : création (2FA), doublon refusé, retrait ; chauffeurs : points actifs seulement', async () => {
      expect((await http().post('/api/v1/admin/meeting-points').set('Authorization', as('ops', 'admin')).send({})).status).toBe(403); // sans 2FA
      expect((await http().post('/api/v1/admin/meeting-points').set('Authorization', as(SAMI, 'driver')).send({})).status).toBe(403);
      const dup = await addPoint({ city: 'Clermont-Ferrand', name: 'Gare routière', address: 'x x x', lat: 45.7, lng: 3.1 });
      expect(dup.status).toBe(400);

      const list = await http().get('/api/v1/meeting-points').set('Authorization', as(SAMI, 'driver')).query({ lat: 45.77, lng: 3.08, radiusKm: 20 });
      expect(list.body).toEqual([expect.objectContaining({ id: clermontId, name: 'Gare routière', transit: 'Tram A — arrêt Gaillard' })]);

      const off = await http().patch(`/api/v1/admin/meeting-points/${clermontId}`).set(admin).send({ active: false });
      expect(off.body.active).toBe(false);
      expect((await http().get('/api/v1/meeting-points').set('Authorization', as(SAMI, 'driver'))).body).toHaveLength(0);
      expect((await publish()).status).toBe(400); // point retiré : plus proposé pour de nouveaux arrêts
    });

    it('tronçons : chaque passager trouve et paie sa partie du trajet ; le trajet complet reste au prix complet', async () => {
      const res = await publish();
      expect(res.status).toBe(201);
      const departureId = res.body.departure.id;

      const lyonClermont = (await searchFrom(LYON, CLERMONT)).body.find((r: any) => r.departureId === departureId);
      expect(lyonClermont).toMatchObject({ origin: 'Gare de Lyon Part-Dieu', destination: 'Gare routière', unitPriceCents: 1800, fullTrip: false, durationMin: 150 });

      const clermontLimoges = (await searchFrom(CLERMONT, LIMOGES, 2)).body.find((r: any) => r.departureId === departureId);
      expect(clermontLimoges).toMatchObject({ localTime: '12:00', origin: 'Gare routière', unitPriceCents: 1200, totalPriceCents: 2400, durationMin: 120 });
      expect(clermontLimoges.board).toMatchObject({ stopId: expect.any(String), instructions: 'Quai 4, devant l’abri vitré' });

      const full = (await searchFrom(LYON, LIMOGES)).body.find((r: any) => r.departureId === departureId);
      expect(full).toMatchObject({ unitPriceCents: 3000, fullTrip: true });

      // Réservation Clermont → Limoges : 2 places à 12 €, montée à 12 h, point de rencontre et consignes.
      const booked = await http().post('/api/v1/lines/bookings').set('Authorization', as(LEA, 'passenger'))
        .send({ departureId, seats: 2, boardStopId: clermontLimoges.board.stopId });
      expect(booked.status).toBe(201);
      expect(booked.body.totalPriceCents).toBe(2400);
      const trip = db.trip.rows.find((t: any) => t.id === booked.body.tripId);
      expect(trip).toMatchObject({ originAddress: 'Gare routière, Clermont-Ferrand', destinationAddress: 'Gare de Limoges-Bénédictins', durationMin: 120, commissionCents: 240 });
      expect(trip.scheduledAt.getTime() - departure2(departureId).departureAt.getTime()).toBe(150 * MIN);

      const view = await http().get(`/api/v1/trips/${trip.id}`).set('Authorization', as(LEA, 'passenger'));
      expect(view.body.meetingPoint).toMatchObject({ name: 'Gare routière', instructions: 'Quai 4, devant l’abri vitré', transit: 'Tram A — arrêt Gaillard' });

      const manifest = await http().get(`/api/v1/operators/me/departures/${departureId}/manifest`).set('Authorization', as(SAMI, 'driver'));
      expect(manifest.body.passengers[0]).toMatchObject({ pickup: 'Gare routière, Clermont-Ferrand', dropoff: 'Gare de Limoges-Bénédictins' });

      // Arrêts figés dès la première place vendue.
      const change = await http().put(`/api/v1/operators/me/lines/${res.body.id}/stops`).set('Authorization', as(SAMI, 'driver')).send({ stops: [] });
      expect(change.status).toBe(409);
    });

    it('réservation refusée : descente avant la montée, arrêt d’un autre départ', async () => {
      const res = await publish();
      const departureId = res.body.departure.id;
      const stopId = db.lineStop.rows.find((x: any) => x.lineId === res.body.id).id;
      const book = (body: Record<string, unknown>) =>
        http().post('/api/v1/lines/bookings').set('Authorization', as(LEA, 'passenger')).send({ departureId, seats: 1, ...body });
      expect((await book({ alightStopId: stopId, boardStopId: stopId })).status).toBe(400);
      expect((await book({ boardStopId: '00000000-0000-4000-8000-999999999999' })).status).toBe(400);
      expect(db.trip.rows.filter((t: any) => t.lineDepartureId === departureId)).toHaveLength(0);
    });

    it('arrêts refusés : prix non croissants, véhicule privatisé ; remplacés tant que rien n’est vendu', async () => {
      expect((await publish({ stops: [{ meetingPointId: clermontId, offsetMin: 150, fareFromOriginCents: 3000 }] })).status).toBe(400);
      expect((await publish({ pricingMode: 'per_vehicle', priceCents: 39000 })).status).toBe(400);

      const res = await publish({ stops: [] });
      expect(res.status).toBe(201);
      const put = await http().put(`/api/v1/operators/me/lines/${res.body.id}/stops`).set('Authorization', as(SAMI, 'driver'))
        .send({ stops: [{ meetingPointId: clermontId, offsetMin: 140, fareFromOriginCents: 1700 }] });
      expect(put.status).toBe(200);
      expect(put.body).toEqual([expect.objectContaining({ position: 1, offsetMin: 140, meetingPoint: expect.objectContaining({ name: 'Gare routière' }) })]);
      const mine = await http().get('/api/v1/operators/me/lines').set('Authorization', as(SAMI, 'driver'));
      expect(mine.body.find((l: any) => l.id === res.body.id).stops).toHaveLength(1);
    });

    const departure2 = (departureId: string) => db.lineDeparture.rows.find((d: any) => d.id === departureId);
  });

  // ── Étape 4 : colis sur les lignes ───────────────────────────────────

  describe('colis sur les lignes', () => {
    const inTwoDays = addDays(tomorrow, 1);
    const publish = (extra: Record<string, unknown> = {}) =>
      http().post('/api/v1/operators/me/departures').set('Authorization', as(SAMI, 'driver')).send({
        vehicleId: VAN,
        originAddress: 'Gare de Lyon Part-Dieu', originLat: LYON.lat, originLng: LYON.lng,
        destinationAddress: 'Gare de Limoges-Bénédictins', destinationLat: LIMOGES.lat, destinationLng: LIMOGES.lng,
        date: inTwoDays, departureTime: '09:30', seats: 7, luggage: 7, pricingMode: 'per_seat', priceCents: 3000, durationMin: 270,
        parcelSlots: 2, parcelPriceCents: 1500,
        ...extra,
      });
    const parcelBody = (departureId: string) => ({
      departureId, description: 'Carton de livres', weightKg: 8, lengthCm: 40, widthCm: 30, heightCm: 30,
      recipientName: 'Sophie Martin', recipientPhone: '0612345678', prohibitedItemsDeclined: true,
    });
    const sendParcel = (who: string, departureId: string) =>
      http().post('/api/v1/lines/bookings/parcel').set('Authorization', as(who, 'passenger')).send(parcelBody(departureId));
    const dep = (id: string) => db.lineDeparture.rows.find((d: any) => d.id === id);
    const moveTo = (id: string, minutes: number) => {
      const at = new Date(Date.now() + minutes * MIN);
      dep(id).departureAt = at;
      for (const t of tripsOf(id)) t.scheduledAt = at;
    };

    it('capacité et prix par colis fixés par l’opérateur ; refusés sans prix ou sur un véhicule privatisé', async () => {
      expect((await publish({ parcelPriceCents: undefined })).status).toBe(400);
      expect((await publish({ pricingMode: 'per_vehicle', priceCents: 39000 })).status).toBe(400);
      const res = await publish();
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ parcelSlots: 2, parcelPriceCents: 1500 });
    });

    it('l’expéditeur trouve le départ, réserve un emplacement : course colis au prix du colis, TVA marchandises, plus de place au 3e', async () => {
      const departureId = (await publish()).body.departure.id;
      const found = await http().get('/api/v1/lines/search').set('Authorization', as(LEA, 'passenger')).query({
        fromLat: LYON.lat, fromLng: LYON.lng, toLat: LIMOGES.lat, toLng: LIMOGES.lng, date: inTwoDays, seats: 1, parcels: 'true',
      });
      expect(found.body.find((r: any) => r.departureId === departureId)).toMatchObject({ unitPriceCents: 1500, totalPriceCents: 1500, parcelSlotsLeft: 2 });

      const booked = await sendParcel(LEA, departureId);
      expect(booked.status).toBe(201);
      expect(booked.body).toMatchObject({ status: 'accepted', totalPriceCents: 1500, pickup: 'Gare de Lyon Part-Dieu' });
      const trip = db.trip.rows.find((t: any) => t.id === booked.body.tripId);
      expect(trip).toMatchObject({ type: 'parcel', source: 'line', driverId: SAMI, lineDepartureId: departureId, vatCents: 250, commissionCents: 125 });
      expect(dep(departureId).parcelsBooked).toBe(1);

      expect((await sendParcel(THOMAS, departureId)).status).toBe(201);
      expect((await sendParcel(NINA, departureId)).status).toBe(409); // 2 emplacements seulement

      // L'expéditeur garde le droit de réserver une place pour lui-même.
      expect((await http().post('/api/v1/lines/bookings').set('Authorization', as(LEA, 'passenger')).send({ departureId, seats: 1 })).status).toBe(201);

      // Annulation par l'expéditeur : emplacement rendu, colis annulé.
      const cancel = await http().post(`/api/v1/trips/${booked.body.tripId}/cancel`).set('Authorization', as(LEA, 'passenger')).send({ reason: 'Envoyé autrement' });
      expect(cancel.status).toBe(200);
      expect(dep(departureId).parcelsBooked).toBe(1);
      expect(db.parcelBooking.rows.find((p: any) => p.id === booked.body.parcelId).status).toBe('cancelled');
    });

    it('au départ : colis remis par QR au point de rendez-vous, en route avec les passagers, remis avec le code et une photo', async () => {
      const departureId = (await publish()).body.departure.id;
      await http().post('/api/v1/lines/bookings').set('Authorization', as(THOMAS, 'passenger')).send({ departureId, seats: 1 });
      const sent = await sendParcel(LEA, departureId);
      const parcel = db.parcelBooking.rows.find((p: any) => p.id === sent.body.parcelId);

      // Liste d'embarquement : le colis à part, jamais compté comme passager.
      const manifest = await http().get(`/api/v1/operators/me/departures/${departureId}/manifest`).set('Authorization', as(SAMI, 'driver'));
      expect(manifest.body.passengers).toHaveLength(1);
      expect(manifest.body.parcels).toEqual([expect.objectContaining({ id: parcel.id, description: 'Carton de livres', status: 'pending' })]);

      const pickup = () => http().post(`/api/v1/bookings/parcel/${parcel.id}/pickup`).set('Authorization', as(SAMI, 'driver')).send({ qrCode: parcel.qrCode });
      expect((await pickup()).status).toBe(409); // trop tôt : dans l'heure qui précède le départ
      moveTo(departureId, 40);
      expect((await pickup()).body.status).toBe('picked_up');

      const start = await http().post(`/api/v1/operators/me/departures/${departureId}/start`).set('Authorization', as(SAMI, 'driver'));
      expect(start.status).toBe(200);
      expect(parcel.status).toBe('in_transit');

      // Pas de fin de départ avec un colis à bord.
      expect((await http().post(`/api/v1/operators/me/departures/${departureId}/complete`).set('Authorization', as(SAMI, 'driver'))).status).toBe(409);
      const delivered = await http().post(`/api/v1/bookings/parcel/${parcel.id}/deliver`).set('Authorization', as(SAMI, 'driver'))
        .field('code', parcel.deliveryCode).attach('photo', JPEG, 'remise.jpg');
      expect(delivered.body.status).toBe('delivered');
      expect((await http().post(`/api/v1/operators/me/departures/${departureId}/complete`).set('Authorization', as(SAMI, 'driver'))).status).toBe(200);
      expect(db.trip.rows.find((t: any) => t.id === sent.body.tripId).status).toBe('completed');

      // Vu de l'expéditeur : mode « ligne », livré.
      const view = await http().get(`/api/v1/bookings/parcel/${parcel.id}`).set('Authorization', as(LEA, 'passenger'));
      expect(view.body).toMatchObject({ mode: 'line', status: 'delivered' });
    });

    it('colis jamais remis au chauffeur : signalé à l’équipe, le départ part avec ses passagers', async () => {
      const departureId = (await publish()).body.departure.id;
      await http().post('/api/v1/lines/bookings').set('Authorization', as(THOMAS, 'passenger')).send({ departureId, seats: 1 });
      const sent = await sendParcel(LEA, departureId);
      moveTo(departureId, 40);
      const start = await http().post(`/api/v1/operators/me/departures/${departureId}/start`).set('Authorization', as(SAMI, 'driver'));
      expect(start.status).toBe(200);
      expect(start.body.started).toBe(1);
      expect(db.parcelBooking.rows.find((p: any) => p.id === sent.body.parcelId).status).toBe('failed');
      expect(db.trip.rows.find((t: any) => t.id === sent.body.tripId).status).toBe('cancelled');
      expect(db.incident.rows).toEqual([expect.objectContaining({ type: 'parcel_failed' })]);
    });

    it('départ à seuil non confirmé : le colis est annulé et remboursé avec les places', async () => {
      const departureId = (await publish({ minPassengers: 3 })).body.departure.id;
      const sent = await sendParcel(LEA, departureId);
      moveTo(departureId, 20 * 60);
      expect((await threshold.tick()).cancelledBookings).toBe(1);
      expect(db.parcelBooking.rows.find((p: any) => p.id === sent.body.parcelId).status).toBe('cancelled');
      expect(db.trip.rows.find((t: any) => t.id === sent.body.tripId)).toMatchObject({ status: 'cancelled', cancellationFeeCents: 0 });
    });
  });
});
