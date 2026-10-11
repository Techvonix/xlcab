import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FakeRedis } from '../testing/fake-redis';
import { memoryPrisma } from '../testing/memory-prisma';
import { FeedbackModule } from './feedback.controller';

// Écran 10 : profil du chauffeur, note après le trajet, signalement.

const JWT_SECRET = 'feedback-secret';
const TRIP = '11111111-1111-4111-8111-111111111111';
const OTHER_TRIP = '22222222-2222-4222-8222-222222222222';

describe('Avis passager (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  const jwt = new JwtService();
  const as = (sub: string, role = 'passenger') => `Bearer ${jwt.sign({ sub, role, jti: `j-${sub}` }, { secret: JWT_SECRET })}`;
  const http = () => request(app.getHttpServer());
  const trip = (patch: Record<string, unknown> = {}) => Object.assign(db.trip.rows.find((t: any) => t.id === TRIP), patch);

  beforeEach(async () => {
    db = memoryPrisma();
    db.user.rows.push(
      { id: 'p1', email: 'lea@x.fr', role: 'passenger', firstName: 'Léa' },
      { id: 'p2', email: 'tom@x.fr', role: 'passenger', firstName: 'Tom' },
      { id: 'd1', email: 'nadia@x.fr', role: 'driver', firstName: 'Nadia', lastName: 'Benali' },
    );
    db.driverProfile.rows.push({ id: 'd1', languages: ['fr', 'en'], pmrTrained: true, rating: 5, ratingCount: 0, totalTrips: 42 });
    db.vehicle.rows.push({ id: 'v1', driverId: 'd1', shuttleType: 'rose', brand: 'Renault', model: 'Trafic', color: 'Blanc', plate: 'AB-123-CD', capacity: 8, pmrEquipped: false, dashcamActive: true, jurisdiction: 'FR' });
    db.trip.rows.push(
      { id: TRIP, passengerId: 'p1', driverId: 'd1', vehicleId: 'v1', status: 'accepted', originLat: 48.85, originLng: 2.35, completedAt: null, scheduledAt: new Date() },
      { id: OTHER_TRIP, passengerId: 'p2', driverId: 'd1', vehicleId: 'v1', status: 'completed', originLat: 48.85, originLng: 2.35, completedAt: new Date(), scheduledAt: new Date() },
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
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ JWT_SECRET, JWT_REFRESH_SECRET: 'r' })] }),
        FakeInfraModule,
        AuditModule,
        AuthModule,
        FeedbackModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterEach(() => app.close());

  describe('profil du chauffeur', () => {
    it('passager d’une course acceptée : prénom, véhicule, plaque, badges ; pas de note tant que personne n’a noté', async () => {
      const res = await http().get(`/api/v1/trips/${TRIP}/driver`).set('Authorization', as('p1'));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        firstName: 'Nadia',
        rating: null,
        ratingCount: 0,
        totalTrips: 42,
        languages: ['fr', 'en'],
        pmrTrained: true,
        vehicle: { brand: 'Renault', plate: 'AB-123-CD', dashcamActive: true, shuttleType: 'rose' },
        canRate: false,
      });
      // Jamais le nom de famille ni l'email du chauffeur.
      expect(JSON.stringify(res.body)).not.toMatch(/Benali|nadia@x\.fr/);
    });

    it('ownership : un autre passager, un chauffeur pas encore engagé → 404', async () => {
      expect((await http().get(`/api/v1/trips/${TRIP}/driver`).set('Authorization', as('p2'))).status).toBe(404);
      trip({ status: 'searching', driverId: null });
      expect((await http().get(`/api/v1/trips/${TRIP}/driver`).set('Authorization', as('p1'))).status).toBe(404);
    });

    it('un chauffeur ne passe pas par ces routes (rôle)', async () => {
      expect((await http().get(`/api/v1/trips/${TRIP}/driver`).set('Authorization', as('d1', 'driver'))).status).toBe(403);
    });

    it('course terminée : plaque masquée, notation proposée', async () => {
      trip({ status: 'completed', completedAt: new Date() });
      const res = await http().get(`/api/v1/trips/${TRIP}/driver`).set('Authorization', as('p1'));
      expect(res.body.vehicle.plate).toBeNull();
      expect(res.body.canRate).toBe(true);
    });
  });

  describe('note', () => {
    it('après l’arrivée : enregistrée une seule fois, moyenne du chauffeur recalculée', async () => {
      trip({ status: 'completed', completedAt: new Date() });
      const first = await http().post(`/api/v1/trips/${TRIP}/rating`).set('Authorization', as('p1')).send({ stars: 4, comment: 'Très ponctuelle' });
      expect(first.status).toBe(201);
      expect(db.driverProfile.rows[0]).toMatchObject({ rating: 4, ratingCount: 1 });

      const again = await http().post(`/api/v1/trips/${TRIP}/rating`).set('Authorization', as('p1')).send({ stars: 1 });
      expect(again.status).toBe(409);

      // Deuxième passager : moyenne (4 + 5) / 2.
      await http().post(`/api/v1/trips/${OTHER_TRIP}/rating`).set('Authorization', as('p2')).send({ stars: 5 });
      expect(db.driverProfile.rows[0]).toMatchObject({ rating: 4.5, ratingCount: 2 });

      const profile = await http().get(`/api/v1/trips/${TRIP}/driver`).set('Authorization', as('p1'));
      expect(profile.body).toMatchObject({ rating: 4.5, ratingCount: 2, canRate: false, myRating: { stars: 4 } });
    });

    it('avant l’arrivée ou après 7 jours : refusée', async () => {
      expect((await http().post(`/api/v1/trips/${TRIP}/rating`).set('Authorization', as('p1')).send({ stars: 5 })).status).toBe(403);
      trip({ status: 'completed', completedAt: new Date(Date.now() - 8 * 24 * 3600 * 1000) });
      const late = await http().post(`/api/v1/trips/${TRIP}/rating`).set('Authorization', as('p1')).send({ stars: 5 });
      expect(late.status).toBe(403);
      expect(late.body.message).toMatch(/7 jours/);
    });

    it('validation : 1 à 5 étoiles entières, commentaire ≤ 500 caractères', async () => {
      trip({ status: 'completed', completedAt: new Date() });
      for (const stars of [0, 6, 3.5, '5']) {
        expect((await http().post(`/api/v1/trips/${TRIP}/rating`).set('Authorization', as('p1')).send({ stars })).status).toBe(400);
      }
      const long = await http().post(`/api/v1/trips/${TRIP}/rating`).set('Authorization', as('p1')).send({ stars: 3, comment: 'x'.repeat(501) });
      expect(long.status).toBe(400);
    });
  });

  describe('signalement', () => {
    it('crée un incident pour l’équipe, tracé ; un second pendant le traitement est refusé', async () => {
      const res = await http().post(`/api/v1/trips/${TRIP}/report`).set('Authorization', as('p1')).send({ reason: 'conduite', details: 'Vitesse excessive sur l’autoroute' });
      expect(res.status).toBe(201);
      expect(db.incident.rows[0]).toMatchObject({ type: 'driver_report', tripId: TRIP, userId: 'p1', status: 'open', notes: 'Conduite dangereuse — Vitesse excessive sur l’autoroute' });
      expect(db.auditLog.rows.some((l: any) => l.action === 'driver.reported')).toBe(true);

      const again = await http().post(`/api/v1/trips/${TRIP}/report`).set('Authorization', as('p1')).send({ reason: 'autre' });
      expect(again.status).toBe(409);
    });

    it('motif inconnu → 400 ; course d’un autre → 404', async () => {
      expect((await http().post(`/api/v1/trips/${TRIP}/report`).set('Authorization', as('p1')).send({ reason: 'insulte' })).status).toBe(400);
      expect((await http().post(`/api/v1/trips/${OTHER_TRIP}/report`).set('Authorization', as('p1')).send({ reason: 'autre' })).status).toBe(404);
    });
  });
});
