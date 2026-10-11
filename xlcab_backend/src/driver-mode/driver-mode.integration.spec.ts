import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { FakeRedis } from '../testing/fake-redis';
import { memoryPrisma } from '../testing/memory-prisma';
import { DriverModeModule } from './driver-mode.module';
import { startOf } from './driver-mode.service';

// Mode chauffeur (écran 15) via HTTP : disponibilité, missions, revenus.

const JWT_SECRET = 'driver-mode-secret';
const HOUR = 3600_000;
const nextYear = new Date(Date.now() + 365 * 24 * HOUR);

describe('Mode chauffeur (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  let redis: FakeRedis;
  const jwt = new JwtService();
  const as = (sub: string, role: string) => `Bearer ${jwt.sign({ sub, role, jti: `j-${sub}` }, { secret: JWT_SECRET })}`;
  const driver = () => as('d1', 'driver');
  const http = () => request(app.getHttpServer());
  const profile = () => db.driverProfile.rows.find((p: any) => p.id === 'd1');

  function seedDriver(overrides: { profile?: object; vehicle?: object } = {}) {
    db.user.rows.push(
      { id: 'd1', email: 'nadia@x.fr', role: 'driver', jurisdiction: 'FR', deletedAt: null, firstName: 'Nadia' },
      { id: 'p1', email: 'lea@x.fr', role: 'passenger', jurisdiction: 'FR', deletedAt: null, firstName: 'Léa', lastName: 'Roux', phone: '+33611111111' },
    );
    db.driverProfile.rows.push({
      id: 'd1', approvedAt: new Date('2026-09-01'), documentsVerified: true, isOnline: false, rating: 4.9, ratingCount: 37, totalTrips: 41,
      licenseExpiry: nextYear, vtcCardExpiry: nextYear, ...overrides.profile,
    });
    db.vehicle.rows.push({
      id: 'v1', driverId: 'd1', plate: 'AB-123-CD', isAvailable: true, dashcamActive: true,
      insuranceExpiry: nextYear, technicalControlExpiry: nextYear, ...overrides.vehicle,
    });
  }

  function addTrip(data: object) {
    const id = `7a1e0000-0000-4000-8000-00000000000${db.trip.rows.length + 1}`;
    db.trip.rows.push({
      id, type: 'passenger', passengerId: 'p1', driverId: 'd1', vehicleId: 'v1', shuttleType: 'bleue',
      originAddress: 'Gare de Lyon', originLat: 48.84, originLng: 2.37, destinationAddress: 'Rouen', destinationLat: 49.45, destinationLng: 1.09,
      durationMin: 97, distanceKm: 135.4, totalPriceCents: 12000, jurisdiction: 'FR', createdAt: new Date(), ...data,
    });
    db.passengerBooking.rows.push({ id: `b-${id}`, tripId: id, seats: 2, childSeats: 1, checkedIn: false, qrCode: 'secret' });
    return id;
  }

  beforeEach(async () => {
    db = memoryPrisma();
    redis = new FakeRedis();

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
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ JWT_SECRET, JWT_REFRESH_SECRET: 'r' })] }),
        FakeInfraModule,
        AuthModule,
        DriverModeModule,
      ],
    })
      .overrideProvider(TrackingGateway)
      .useValue({ emitTripStatus: jest.fn(), emitToDriver: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterEach(() => app.close());

  describe('en ligne / hors ligne', () => {
    it('chauffeur validé, documents à jour : passe en ligne', async () => {
      seedDriver();
      const res = await http().post('/api/v1/drivers/me/online').set('Authorization', driver()).send({ online: true });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ online: true });
      expect(profile().isOnline).toBe(true);
    });

    it.each([
      ['compte non validé', { profile: { approvedAt: null } }, 'pas encore validé'],
      ['permis expiré', { profile: { licenseExpiry: new Date('2026-01-01') } }, 'Permis de conduire expiré'],
      ['carte VTC expirée', { profile: { vtcCardExpiry: new Date('2026-01-01') } }, 'Carte VTC expirée'],
      ['assurance expirée', { vehicle: { insuranceExpiry: new Date('2026-01-01') } }, 'Assurance ou contrôle technique expiré'],
      ['dashcam inactive', { vehicle: { dashcamActive: false } }, 'Dashcam inactive'],
    ])('refus si %s, avec la raison', async (_label, overrides, message) => {
      seedDriver(overrides);
      const res = await http().post('/api/v1/drivers/me/online').set('Authorization', driver()).send({ online: true });
      expect(res.status).toBe(403);
      expect(res.body.message).toContain(message);
      expect(profile().isOnline).toBe(false);
    });

    it('hors ligne : retiré du géo-index et de la présence', async () => {
      seedDriver({ profile: { isOnline: true } });
      redis.store.set('driver:seen:d1', '1');
      const res = await http().post('/api/v1/drivers/me/online').set('Authorization', driver()).send({ online: false });
      expect(res.body).toEqual({ online: false });
      expect(profile().isOnline).toBe(false);
      expect(redis.store.has('driver:seen:d1')).toBe(false);
    });

    it('hors ligne refusé pendant une course en cours', async () => {
      seedDriver({ profile: { isOnline: true } });
      addTrip({ status: 'started', scheduledAt: new Date() });
      const res = await http().post('/api/v1/drivers/me/online').set('Authorization', driver()).send({ online: false });
      expect(res.status).toBe(409);
      expect(profile().isOnline).toBe(true);
    });

    it('réservé aux chauffeurs, corps validé', async () => {
      seedDriver();
      expect((await http().post('/api/v1/drivers/me/online').set('Authorization', as('p1', 'passenger')).send({ online: true })).status).toBe(403);
      expect((await http().post('/api/v1/drivers/me/online').set('Authorization', driver()).send({ online: 'oui' })).status).toBe(400);
      expect((await http().get('/api/v1/drivers/me/trips')).status).toBe(401);
    });
  });

  describe('missions', () => {
    it('à venir triées par heure ; téléphone du passager seulement à l’approche', async () => {
      seedDriver();
      const later = addTrip({ status: 'accepted', scheduledAt: new Date(Date.now() + 3 * 24 * HOUR) });
      const soon = addTrip({ status: 'accepted', scheduledAt: new Date(Date.now() + 40 * 60_000) });

      const res = await http().get('/api/v1/drivers/me/trips').set('Authorization', driver());

      expect(res.status).toBe(200);
      expect(res.body.upcoming.map((m: any) => m.id)).toEqual([soon, later]);
      expect(res.body.upcoming[0]).toMatchObject({
        seats: 2, childSeats: 1, distanceKm: 135.4, passenger: { firstName: 'Léa', phone: '+33611111111' },
      });
      expect(res.body.upcoming[1].passenger).toEqual({ firstName: 'Léa', phone: null });
      // Jamais le QR (le chauffeur doit le scanner) ni le nom de famille.
      expect(JSON.stringify(res.body)).not.toContain('secret');
      expect(JSON.stringify(res.body)).not.toContain('Roux');
    });

    it('courses terminées : sans aucune donnée du passager', async () => {
      seedDriver();
      addTrip({ status: 'completed', scheduledAt: new Date(Date.now() - 5 * HOUR), completedAt: new Date(Date.now() - 3 * HOUR) });
      const res = await http().get('/api/v1/drivers/me/trips').set('Authorization', driver());
      expect(res.body.recent).toHaveLength(1);
      expect(res.body.recent[0].passenger).toBeNull();
    });

    it('ne montre jamais les courses d’un autre chauffeur', async () => {
      seedDriver();
      addTrip({ status: 'accepted', driverId: 'd2', scheduledAt: new Date(Date.now() + HOUR) });
      const res = await http().get('/api/v1/drivers/me/trips').set('Authorization', driver());
      expect(res.body.upcoming).toEqual([]);
    });
  });

  describe('état au lancement', () => {
    it('en ligne, note, et offre en cours retrouvée', async () => {
      seedDriver({ profile: { isOnline: true } });
      const tripId = addTrip({ status: 'searching', driverId: null });
      redis.store.set('driver:offer:d1', tripId);
      redis.store.set(`dispatch:${tripId}:vehicle`, JSON.stringify({ driverId: 'd1', vehicleId: 'v1' }));
      redis.store.set(`dispatch:${tripId}:offer`, JSON.stringify({ tripId, seats: 2, expiresAt: Date.now() + 20_000 }));

      const res = await http().get('/api/v1/drivers/me/status').set('Authorization', driver());

      expect(res.body).toMatchObject({ online: true, approved: true, rating: 4.9, totalTrips: 41, offer: { tripId, seats: 2 } });
    });

    it('chauffeur jamais noté : pas de note (la valeur par défaut serait trompeuse)', async () => {
      seedDriver({ profile: { rating: 5, ratingCount: 0 } });
      const res = await http().get('/api/v1/drivers/me/status').set('Authorization', driver());
      expect(res.body).toMatchObject({ rating: null, ratingCount: 0 });
    });
  });

  describe('revenus', () => {
    it('jour / semaine / mois, courses terminées uniquement', async () => {
      seedDriver();
      const now = new Date();
      addTrip({ status: 'completed', completedAt: new Date(now.getTime() - 60_000), totalPriceCents: 12000 });
      addTrip({ status: 'completed', completedAt: new Date(startOf('day', now, 'Europe/Paris').getTime() - 1), totalPriceCents: 8000 });
      addTrip({ status: 'cancelled', completedAt: null, cancelledAt: now, totalPriceCents: 50000 });

      const res = await http().get('/api/v1/drivers/me/earnings').set('Authorization', driver());

      expect(res.body.commissionPercent).toBe(10);
      expect(res.body.today).toEqual({ trips: 1, grossCents: 12000, exVatCents: 12000, commissionCents: 1200, netCents: 10800 });
      expect(res.body.month.grossCents).toBeGreaterThanOrEqual(12000);
      expect(res.body.month.grossCents).not.toBe(62000);
    });

    it('commission sur le HT : la TVA d’un colis ne fait pas partie du revenu', async () => {
      seedDriver();
      // 12 186 c passager (TVA 0 %) + 800 c HT de colis à 20 % = 13 146 c TTC.
      addTrip({ status: 'completed', completedAt: new Date(Date.now() - 60_000), totalPriceCents: 13146, vatCents: 160 });

      const res = await http().get('/api/v1/drivers/me/earnings').set('Authorization', driver());

      expect(res.body.today).toEqual({ trips: 1, grossCents: 13146, exVatCents: 12986, commissionCents: 1299, netCents: 11687 });
    });
  });
});

describe('startOf (heure locale)', () => {
  it('minuit à Paris en heure d’été = 22 h UTC la veille', () => {
    expect(startOf('day', new Date('2026-07-15T10:00:00Z'), 'Europe/Paris').toISOString()).toBe('2026-07-14T22:00:00.000Z');
  });

  it('semaine depuis lundi, mois depuis le 1er (heure d’hiver)', () => {
    const sunday = new Date('2026-11-15T12:00:00Z');
    expect(startOf('week', sunday, 'Europe/Paris').toISOString()).toBe('2026-11-08T23:00:00.000Z');
    expect(startOf('month', sunday, 'Europe/Paris').toISOString()).toBe('2026-10-31T23:00:00.000Z');
  });

  it('jour du passage à l’heure d’hiver : minuit à l’heure d’été', () => {
    // 25 octobre 2026 : 3 h → 2 h ; minuit était encore à UTC+2.
    expect(startOf('day', new Date('2026-10-25T15:00:00Z'), 'Europe/Paris').toISOString()).toBe('2026-10-24T22:00:00.000Z');
  });
});
