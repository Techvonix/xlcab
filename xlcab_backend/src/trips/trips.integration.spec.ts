import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { mfaProof } from '../testing/two-factor-proof';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.service';
import { NotificationsModule } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { CorporateModule } from '../corporate/corporate.module';
import { FakeRedis } from '../testing/fake-redis';
import { memoryPrisma } from '../testing/memory-prisma';
import { cancellationFee } from './cancellation';
import { TripsModule } from './trips.module';

// Cycle de vie d'une course (Partie 6 : start / complete / cancel / GET),
// de bout en bout via HTTP. Base et Redis en mémoire ; la diffusion
// WebSocket est observée sur un double du TrackingGateway.

const JWT_SECRET = 'trips-secret';
const TRIP = '7a1e0000-0000-4000-8000-000000000001';
const QR = '9b2e0000-0000-4000-8000-0000000000aa';
const inMin = (m: number) => new Date(Date.now() + m * 60_000);

describe('Trips (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  let redis: FakeRedis;
  let emitted: { tripId: string; status: string }[];
  const jwt = new JwtService();
  const as = (sub: string, role: string) => `Bearer ${jwt.sign({ sub, role, jti: `j-${sub}` }, { secret: JWT_SECRET })}`;
  const http = () => request(app.getHttpServer());
  const trip = () => db.trip.rows.find((t: any) => t.id === TRIP);

  /** Course acceptée par d1, départ dans [minutes]. */
  function seedTrip(minutes = 30, extra: object = {}) {
    db.user.rows.push(
      { id: 'p1', email: 'lea@x.fr', role: 'passenger', jurisdiction: 'FR', deletedAt: null, firstName: 'Léa', lastName: 'Roux' },
      { id: 'd1', email: 'nadia@x.fr', role: 'driver', jurisdiction: 'FR', deletedAt: null, firstName: 'Nadia' },
      { id: 'd2', email: 'autre@x.fr', role: 'driver', jurisdiction: 'FR', deletedAt: null },
      { id: 'ops', email: 'ops@xlcab.com', role: 'admin', jurisdiction: 'FR', deletedAt: null },
    );
    db.driverProfile.rows.push({ id: 'd1', totalTrips: 41 });
    db.vehicle.rows.push({ id: 'v1', driverId: 'd1', plate: 'AB-123-CD', brand: 'Renault', model: 'Trafic', color: 'Gris', dashcamActive: true });
    db.trip.rows.push({
      id: TRIP, type: 'passenger', status: 'accepted', passengerId: 'p1', driverId: 'd1', vehicleId: 'v1', shuttleType: 'bleue',
      originAddress: 'Gare de Lyon', originLat: 48.84, originLng: 2.37, destinationAddress: 'Rouen', destinationLat: 49.45, destinationLng: 1.09,
      scheduledAt: inMin(minutes), durationMin: 97, totalPriceCents: 12000, vatCents: 0, jurisdiction: 'FR', corporateId: null,
      acceptedAt: new Date(), createdAt: new Date(), ...extra,
    });
    db.passengerBooking.rows.push({ id: 'b1', tripId: TRIP, seats: 2, childSeats: 0, wifiRequested: false, extraLuggage: false, qrCode: QR, checkedIn: false });
    db.tripPriceLine.rows.push({ id: 'l1', tripId: TRIP, regime: 'passenger', baseCents: 12000, ratePercent: 0, vatCents: 0 });
  }

  beforeEach(async () => {
    db = memoryPrisma();
    redis = new FakeRedis();
    emitted = [];

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
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ JWT_SECRET, JWT_REFRESH_SECRET: 'r', GOOGLE_MAPS_API_KEY: 'k' })] }),
        FakeInfraModule,
        AuditModule,
        NotificationsModule,
        AuthModule,
        TripsModule,
        CorporateModule,
      ],
    })
      .overrideProvider(TrackingGateway)
      .useValue({
        emitTripStatus: (tripId: string, status: string) => emitted.push({ tripId, status }),
        emitToDriver: jest.fn(),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterEach(() => app.close());

  describe('démarrage', () => {
    it('QR du passager scanné : course démarrée, passager embarqué, suivi activé', async () => {
      seedTrip(30);
      const res = await http().post(`/api/v1/trips/${TRIP}/start`).set('Authorization', as('d1', 'driver')).send({ qrCode: QR });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'started', checkedIn: true });
      expect(trip()).toMatchObject({ status: 'started', startedAt: expect.any(Date) });
      expect(db.passengerBooking.rows[0].checkedIn).toBe(true);
      expect(redis.store.get('driver:trip:d1')).toBe(TRIP);
      expect(emitted).toEqual([{ tripId: TRIP, status: 'started' }]);
      expect(db.notification.rows.at(-1)).toMatchObject({ userId: 'p1', type: 'trip.started' });
    });

    it('refuse un QR code qui n’est pas celui de la course', async () => {
      seedTrip(30);
      const res = await http()
        .post(`/api/v1/trips/${TRIP}/start`)
        .set('Authorization', as('d1', 'driver'))
        .send({ qrCode: '00000000-0000-4000-8000-000000000000' });
      expect(res.status).toBe(400);
      expect(trip().status).toBe('accepted');
    });

    it('trop tôt : impossible de démarrer plus d’1 h avant le départ prévu', async () => {
      seedTrip(3 * 60);
      const res = await http().post(`/api/v1/trips/${TRIP}/start`).set('Authorization', as('d1', 'driver')).send({});
      expect(res.status).toBe(409);
      expect(res.body.message).toContain('Trop tôt');
    });

    it('dashcam inactive : démarrage refusé (Partie 8)', async () => {
      seedTrip(30);
      db.vehicle.rows[0].dashcamActive = false;
      const res = await http().post(`/api/v1/trips/${TRIP}/start`).set('Authorization', as('d1', 'driver')).send({});
      expect(res.status).toBe(409);
      expect(res.body.message).toContain('Dashcam');
    });

    it('seul le chauffeur attribué peut démarrer (un autre chauffeur : 404, un passager : 403)', async () => {
      seedTrip(30);
      expect((await http().post(`/api/v1/trips/${TRIP}/start`).set('Authorization', as('d2', 'driver')).send({})).status).toBe(404);
      expect((await http().post(`/api/v1/trips/${TRIP}/start`).set('Authorization', as('p1', 'passenger')).send({})).status).toBe(403);
    });
  });

  describe('fin de course', () => {
    it('terminée : suivi coupé, compteur du chauffeur, passager notifié', async () => {
      seedTrip(30, { status: 'started', startedAt: new Date() });
      redis.store.set('driver:trip:d1', TRIP);

      const res = await http().post(`/api/v1/trips/${TRIP}/complete`).set('Authorization', as('d1', 'driver'));

      expect(res.status).toBe(200);
      expect(trip()).toMatchObject({ status: 'completed', completedAt: expect.any(Date) });
      expect(redis.store.has('driver:trip:d1')).toBe(false);
      expect(db.driverProfile.rows[0].totalTrips).toBe(42);
      expect(emitted.at(-1)).toEqual({ tripId: TRIP, status: 'completed' });
      expect(db.notification.rows.at(-1)).toMatchObject({ userId: 'p1', type: 'trip.completed' });
    });

    it('une course non démarrée ne peut pas être terminée', async () => {
      seedTrip(30);
      expect((await http().post(`/api/v1/trips/${TRIP}/complete`).set('Authorization', as('d1', 'driver'))).status).toBe(409);
    });

    it('ne libère pas le suivi d’une AUTRE course du chauffeur', async () => {
      seedTrip(30, { status: 'started' });
      redis.store.set('driver:trip:d1', 'autre-course');
      await http().post(`/api/v1/trips/${TRIP}/complete`).set('Authorization', as('d1', 'driver'));
      expect(redis.store.get('driver:trip:d1')).toBe('autre-course');
    });
  });

  describe('annulation (CGV, Partie 13)', () => {
    const cancelAs = (sub: string, role: string) =>
      http().post(`/api/v1/trips/${TRIP}/cancel`).set('Authorization', as(sub, role)).send({ reason: 'Changement de programme' });

    it('passager, plus de 24 h avant : gratuite', async () => {
      seedTrip(48 * 60);
      const res = await cancelAs('p1', 'passenger');
      expect(res.body).toMatchObject({ status: 'cancelled', feePercent: 0, feeCents: 0 });
    });

    it('passager, 10 h avant : 50 % ; chauffeur prévenu et libéré', async () => {
      seedTrip(10 * 60);
      redis.store.set('driver:trip:d1', TRIP);
      const res = await cancelAs('p1', 'passenger');

      expect(res.body).toMatchObject({ feePercent: 50, feeCents: 6000 });
      expect(trip()).toMatchObject({ status: 'cancelled', cancellationFeeCents: 6000, cancellationReason: 'Changement de programme' });
      expect(redis.store.has('driver:trip:d1')).toBe(false);
      expect(db.notification.rows.at(-1)).toMatchObject({ userId: 'd1', type: 'trip.cancelled' });
    });

    it('passager, 1 h avant : 100 %', async () => {
      seedTrip(60);
      expect((await cancelAs('p1', 'passenger')).body).toMatchObject({ feePercent: 100, feeCents: 12000 });
    });

    it('course en cours : le passager ne peut pas annuler, un admin si (sans frais)', async () => {
      seedTrip(0, { status: 'started' });
      expect((await cancelAs('p1', 'passenger')).status).toBe(409);
      const admin = await cancelAs('ops', 'admin');
      expect(admin.body).toMatchObject({ status: 'cancelled', feeCents: 0 });
    });

    it('un tiers ne peut pas annuler (404, même réponse qu’un trajet inexistant)', async () => {
      seedTrip(60);
      db.user.rows.push({ id: 'p2', email: 'x@x.fr', role: 'passenger', jurisdiction: 'FR', deletedAt: null });
      expect((await cancelAs('p2', 'passenger')).status).toBe(404);
      expect(trip().status).toBe('accepted');
    });

    it('désistement à 5 h du départ : remise en attente, nouvelle recherche à T − 3 h', async () => {
      seedTrip(5 * 60);
      const res = await cancelAs('d1', 'driver');
      expect(res.body).toMatchObject({ withdrawn: true, status: 'pending' });
      expect(trip()).toMatchObject({ driverId: null, status: 'pending' });
    });

    it('désistement du chauffeur : sans frais, la course repart en recherche', async () => {
      seedTrip(2 * 60);
      redis.store.set('driver:trip:d1', TRIP);
      const res = await cancelAs('d1', 'driver');

      expect(res.status).toBe(200);
      expect(res.body.withdrawn).toBe(true);
      // Aucun autre chauffeur en ligne dans ce test : "aucun chauffeur".
      expect(trip()).toMatchObject({ driverId: null, vehicleId: null, status: 'no_driver' });
      expect(trip().cancellationFeeCents).toBeUndefined();
      expect(redis.store.has('driver:trip:d1')).toBe(false);
      expect(db.notification.rows.find((n: any) => n.type === 'trip.driver_withdrew')).toMatchObject({ userId: 'p1' });
    });

    it('motif obligatoire', async () => {
      seedTrip(60);
      const res = await http().post(`/api/v1/trips/${TRIP}/cancel`).set('Authorization', as('p1', 'passenger')).send({});
      expect(res.status).toBe(400);
    });
  });

  describe('consultation (GET /trips/:id)', () => {
    it('le passager voit son QR d’embarquement, le chauffeur non', async () => {
      seedTrip(30);
      const p = await http().get(`/api/v1/trips/${TRIP}`).set('Authorization', as('p1', 'passenger'));
      expect(p.body).toMatchObject({
        status: 'accepted',
        booking: { seats: 2, qrCode: QR },
        driver: { firstName: 'Nadia', vehicle: { plate: 'AB-123-CD' } },
        price: { totalCents: 12000, lines: [{ regime: 'passenger', ratePercent: 0 }] },
      });
      const d = await http().get(`/api/v1/trips/${TRIP}`).set('Authorization', as('d1', 'driver'));
      expect(d.body.booking.qrCode).toBeUndefined();
    });

    it('un tiers : 404', async () => {
      seedTrip(30);
      expect((await http().get(`/api/v1/trips/${TRIP}`).set('Authorization', as('d2', 'driver'))).status).toBe(404);
    });
  });

  it('bout en bout : course d’entreprise démarrée puis terminée → facturable sur le relevé', async () => {
    seedTrip(30, { corporateId: 'corp-1', costCenter: 'Ventes' });
    db.user.rows.push({ id: 'boss', email: 'boss@acme.fr', role: 'corporate_admin', jurisdiction: 'FR', deletedAt: null });
    db.corporateAccount.rows.push({ id: 'corp-1', companyName: 'ACME SAS', jurisdiction: 'FR', monthlyLimitCents: null });
    db.corporateMember.rows.push({ id: 'm1', corporateId: 'corp-1', userId: 'boss', role: 'admin', isActive: true });
    const month = trip().scheduledAt.toISOString().slice(0, 7);
    const invoice = () => http().get(`/api/v1/corporate/invoices?month=${month}`).set({ Authorization: as('boss', 'corporate_admin'), 'X-2FA-Token': mfaProof(JWT_SECRET, 'boss') });

    expect((await invoice()).body.totals.billableTrips).toBe(0);

    await http().post(`/api/v1/trips/${TRIP}/start`).set('Authorization', as('d1', 'driver')).send({ qrCode: QR });
    await http().post(`/api/v1/trips/${TRIP}/complete`).set('Authorization', as('d1', 'driver'));

    const after = (await invoice()).body;
    expect(after.totals).toMatchObject({ billableTrips: 1, passengerHtCents: 12000, totalTtcCents: 12000 });
    // L'admin de l'entreprise peut aussi consulter la course.
    expect((await http().get(`/api/v1/trips/${TRIP}`).set('Authorization', as('boss', 'corporate_admin'))).status).toBe(200);
  });
});

describe('cancellationFee', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  const at = (h: number) => new Date(now.getTime() + h * 3600_000);

  it('applique les paliers des CGV aux bornes exactes', () => {
    expect(cancellationFee(10000, at(24), now)).toEqual({ percent: 0, feeCents: 0 });
    expect(cancellationFee(10000, at(23.99), now)).toEqual({ percent: 50, feeCents: 5000 });
    expect(cancellationFee(10000, at(2), now)).toEqual({ percent: 50, feeCents: 5000 });
    expect(cancellationFee(10000, at(1.99), now)).toEqual({ percent: 100, feeCents: 10000 });
    expect(cancellationFee(10001, at(10), now)).toEqual({ percent: 50, feeCents: 5001 }); // arrondi
  });
});
