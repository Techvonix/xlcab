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
import { memoryPrisma } from '../testing/memory-prisma';
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
      ],
    })
      .overrideProvider(TrackingGateway)
      .useValue({ emitTripStatus: jest.fn(), emitToDriver: jest.fn() })
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
});
