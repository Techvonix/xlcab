import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.service';
import { NotificationsModule } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { STRIPE_CLIENT } from '../payments/stripe.provider';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { FakeRedis } from '../testing/fake-redis';
import { FakeStripe } from '../testing/fake-stripe';
import { memoryPrisma } from '../testing/memory-prisma';
import { UsersModule } from './users.module';

// Profil et droits RGPD (accès, rectification, effacement) via HTTP.

const JWT_SECRET = 'users-secret';
const PASSWORD = 'MotDePasse!2026';

describe('Users (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  let redis: FakeRedis;
  let stripe: FakeStripe;
  const jwt = new JwtService();
  const as = (sub: string, role = 'passenger') => `Bearer ${jwt.sign({ sub, role, jti: `j-${sub}` }, { secret: JWT_SECRET })}`;
  const http = () => request(app.getHttpServer());
  const user = () => db.user.rows.find((u: any) => u.id === 'p1');

  beforeAll(async () => {
    // bcrypt coût 4 : test rapide, même algorithme.
    (global as any).__hash = await bcrypt.hash(PASSWORD, 4);
  });

  beforeEach(async () => {
    db = memoryPrisma();
    redis = new FakeRedis();
    stripe = new FakeStripe();
    db.user.rows.push({
      id: 'p1', email: 'lea@exemple.fr', phone: '+33611111111', firstName: 'Léa', lastName: 'Roux', role: 'passenger',
      locale: 'fr', jurisdiction: 'FR', createdAt: new Date('2026-09-01'), deletedAt: null,
      passwordHash: (global as any).__hash, stripeCustomerId: 'cus_lea', termsAcceptedAt: new Date('2026-09-01'), termsVersion: '2026-10-01',
    });
    db.notification.rows.push({ id: 'n1', userId: 'p1', type: 'trip.completed', title: 'Course terminée', body: 'Merci', createdAt: new Date() });

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
        AuditModule,
        NotificationsModule,
        AuthModule,
        UsersModule,
      ],
    })
      .overrideProvider(STRIPE_CLIENT)
      .useValue(stripe)
      .overrideProvider(TrackingGateway)
      .useValue({ emitTripStatus: jest.fn(), emitToDriver: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterEach(() => app.close());

  describe('profil', () => {
    it('GET /users/me : profil sans aucun secret', async () => {
      const res = await http().get('/api/v1/users/me').set('Authorization', as('p1'));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ email: 'lea@exemple.fr', firstName: 'Léa', role: 'passenger' });
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(res.body).not.toHaveProperty('stripeCustomerId');
    });

    it('PATCH /users/me : prénom, nom, langue ; email et rôle non modifiables', async () => {
      const ok = await http().patch('/api/v1/users/me').set('Authorization', as('p1')).send({ firstName: '  Léana ', locale: 'en' });
      expect(ok.status).toBe(200);
      expect(user()).toMatchObject({ firstName: 'Léana', locale: 'en' });

      expect((await http().patch('/api/v1/users/me').set('Authorization', as('p1')).send({ role: 'admin' })).status).toBe(400);
      expect((await http().patch('/api/v1/users/me').set('Authorization', as('p1')).send({ email: 'x@y.fr' })).status).toBe(400);
      expect((await http().patch('/api/v1/users/me').set('Authorization', as('p1')).send({ locale: 'de' })).status).toBe(400);
      expect(user().role).toBe('passenger');
    });
  });

  describe('export (droit d’accès)', () => {
    it('toutes les données du compte, sans mot de passe ni QR', async () => {
      db.trip.rows.push({ id: 't1', passengerId: 'p1', driverId: 'd1', status: 'completed', type: 'passenger', scheduledAt: new Date(), totalPriceCents: 12000 });
      db.passengerBooking.rows.push({ id: 'b1', tripId: 't1', qrCode: 'qr-secret' });

      const res = await http().get('/api/v1/users/me/export').set('Authorization', as('p1'));

      expect(res.status).toBe(200);
      expect(res.body.trips).toEqual([expect.objectContaining({ id: 't1', role: 'passenger' })]);
      expect(res.body.consent).toMatchObject({ termsVersion: '2026-10-01' });
      expect(res.body.notifications).toHaveLength(1);
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain('passwordHash');
      expect(raw).not.toContain('qr-secret');
      expect(raw).not.toContain('cus_lea');
    });

    it('limité à 5 exports par jour', async () => {
      for (let i = 0; i < 5; i++) await http().get('/api/v1/users/me/export').set('Authorization', as('p1'));
      expect((await http().get('/api/v1/users/me/export').set('Authorization', as('p1'))).status).toBe(429);
    });
  });

  describe('suppression (droit à l’effacement)', () => {
    const remove = (password?: string, auth = as('p1')) =>
      http().delete('/api/v1/users/me').set('Authorization', auth).send(password === undefined ? {} : { password });

    it('anonymise le compte, révoque toutes les sessions, supprime le client Stripe', async () => {
      redis.store.set('refresh:p1:telephone', 'r1');
      redis.store.set('refresh:p1:tablette', 'r2');
      redis.store.set('refresh:p2:autre', 'r3');
      db.trip.rows.push({ id: 't1', passengerId: 'p1', status: 'completed', totalPriceCents: 12000 });

      const res = await remove(PASSWORD);

      expect(res.status).toBe(200);
      expect(user()).toMatchObject({
        email: 'supprime-p1@anonyme.invalid', phone: null, firstName: null, lastName: null,
        passwordHash: null, deletedAt: expect.any(Date), termsVersion: '2026-10-01',
      });
      expect(db.notification.rows).toHaveLength(0);
      // Course conservée (comptabilité), sans identité côté compte.
      expect(db.trip.rows[0].passengerId).toBe('p1');
      expect(redis.store.has('refresh:p1:telephone')).toBe(false);
      expect(redis.store.has('refresh:p1:tablette')).toBe(false);
      expect(redis.store.has('refresh:p2:autre')).toBe(true);
      expect([...redis.store.keys()].some((k) => k.startsWith('blacklist:'))).toBe(true);
      expect(stripe.customersDeleted).toEqual(['cus_lea']);
      expect(db.auditLog.rows.some((l: any) => l.action === 'user.delete')).toBe(true);
    });

    it('mot de passe obligatoire et vérifié', async () => {
      expect((await remove()).status).toBe(400);
      expect((await remove('mauvais')).status).toBe(403);
      expect(user().deletedAt).toBeNull();
    });

    it('refusée tant qu’une réservation est à venir', async () => {
      db.trip.rows.push({ id: 't1', passengerId: 'p1', status: 'accepted', totalPriceCents: 12000 });
      const res = await remove(PASSWORD);
      expect(res.status).toBe(409);
      expect(res.body.message).toContain('Annulez d’abord vos réservations');
      expect(user().deletedAt).toBeNull();
    });

    it('compte entreprise ou équipe XLCAB : via le support', async () => {
      expect((await remove(PASSWORD, as('p1', 'corporate_admin'))).status).toBe(403);
      expect((await remove(PASSWORD, as('p1', 'admin'))).status).toBe(403);
    });

    it('chauffeur : retiré du matching (hors ligne, véhicule indisponible)', async () => {
      user().role = 'driver';
      db.driverProfile.rows.push({ id: 'p1', isOnline: true });
      db.vehicle.rows.push({ id: 'v1', driverId: 'p1', plate: 'AB-123-CD', isAvailable: true });
      redis.store.set('driver:seen:p1', '1');

      expect((await remove(PASSWORD, as('p1', 'driver'))).status).toBe(200);
      expect(db.driverProfile.rows[0].isOnline).toBe(false);
      expect(db.vehicle.rows[0].isAvailable).toBe(false);
      expect(redis.store.has('driver:seen:p1')).toBe(false);
    });

    it('compte supprimé : plus d’accès au profil', async () => {
      await remove(PASSWORD);
      // Nouveau jeton (l'ancien est blacklisté) : le compte n'existe plus.
      const res = await http().get('/api/v1/users/me').set('Authorization', `Bearer ${jwt.sign({ sub: 'p1', role: 'passenger', jti: 'autre' }, { secret: JWT_SECRET })}`);
      expect(res.status).toBe(401);
    });
  });
});
