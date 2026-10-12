import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { HealthModule } from '../health/health.controller';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FakeRedis } from '../testing/fake-redis';
import { memoryPrisma } from '../testing/memory-prisma';
import { UserSettingsController, UserSettingsService } from './user-settings';

// Partie 6 : préférences et adresses favorites (écran 13), sonde de santé.

const JWT_SECRET = 'settings-secret';

describe('Préférences, adresses favorites, santé (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  let redis: FakeRedis;
  const jwt = new JwtService();
  const as = (sub: string) => `Bearer ${jwt.sign({ sub, role: 'passenger', jti: `j-${sub}` }, { secret: JWT_SECRET })}`;
  const http = () => request(app.getHttpServer());
  const home = { label: 'Maison', address: '12 rue de la Paix, 75002 Paris', lat: 48.869, lng: 2.331 };

  beforeEach(async () => {
    db = memoryPrisma();
    db.$queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    redis = new FakeRedis();
    (redis as any).ping = jest.fn().mockResolvedValue('PONG');

    @Global()
    @Module({
      providers: [
        { provide: PrismaService, useValue: db },
        { provide: RedisService, useValue: redis },
      ],
      exports: [PrismaService, RedisService],
    })
    class FakeInfraModule {}

    @Module({ controllers: [UserSettingsController], providers: [UserSettingsService] })
    class SettingsTestModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ JWT_SECRET, JWT_REFRESH_SECRET: 'r' })] }),
        FakeInfraModule,
        AuthModule,
        SettingsTestModule,
        HealthModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterEach(() => app.close());

  describe('préférences', () => {
    it('valeurs par défaut sans ligne en base : prospection désactivée (RGPD)', async () => {
      const res = await http().get('/api/v1/users/me/preferences').set('Authorization', as('p1'));
      expect(res.body).toEqual({ notifyPush: true, notifyEmail: true, notifySms: false, marketing: false, autoShareTrips: false });
    });

    it('modification partielle conservée ; champ inconnu ou non booléen refusé', async () => {
      const res = await http().patch('/api/v1/users/me/preferences').set('Authorization', as('p1')).send({ marketing: true, notifyEmail: false });
      expect(res.body).toEqual({ notifyPush: true, notifyEmail: false, notifySms: false, marketing: true, autoShareTrips: false });
      const again = await http().patch('/api/v1/users/me/preferences').set('Authorization', as('p1')).send({ notifySms: true });
      expect(again.body).toEqual({ notifyPush: true, notifyEmail: false, notifySms: true, marketing: true, autoShareTrips: false });

      expect((await http().patch('/api/v1/users/me/preferences').set('Authorization', as('p1')).send({ marketing: 'oui' })).status).toBe(400);
      expect((await http().patch('/api/v1/users/me/preferences').set('Authorization', as('p1')).send({ role: 'admin' })).status).toBe(400);
    });

    it('authentification exigée', async () => {
      expect((await http().get('/api/v1/users/me/preferences')).status).toBe(401);
    });
  });

  describe('adresses favorites', () => {
    it('ajout, liste, suppression', async () => {
      const created = await http().post('/api/v1/users/me/addresses').set('Authorization', as('p1')).send(home);
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ id: expect.any(String), ...home });

      const list = await http().get('/api/v1/users/me/addresses').set('Authorization', as('p1'));
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).not.toHaveProperty('userId');

      const del = await http().delete(`/api/v1/users/me/addresses/${created.body.id}`).set('Authorization', as('p1'));
      expect(del.status).toBe(200);
      expect(db.savedAddress.rows).toHaveLength(0);
    });

    it('ownership : chacun ne voit et ne supprime que ses adresses', async () => {
      const mine = await http().post('/api/v1/users/me/addresses').set('Authorization', as('p1')).send(home);
      expect((await http().get('/api/v1/users/me/addresses').set('Authorization', as('p2'))).body).toEqual([]);
      expect((await http().delete(`/api/v1/users/me/addresses/${mine.body.id}`).set('Authorization', as('p2'))).status).toBe(404);
      expect(db.savedAddress.rows).toHaveLength(1);
    });

    it('10 au maximum ; coordonnées et nom validés', async () => {
      for (let i = 0; i < 10; i++) {
        await http().post('/api/v1/users/me/addresses').set('Authorization', as('p1')).send({ ...home, label: `Adresse ${i}` });
      }
      const eleventh = await http().post('/api/v1/users/me/addresses').set('Authorization', as('p1')).send(home);
      expect(eleventh.status).toBe(400);
      expect(eleventh.body.message).toMatch(/10 adresses/);

      for (const bad of [{ ...home, lat: 91 }, { ...home, lng: 'x' }, { ...home, label: '  ' }, { ...home, label: 'x'.repeat(41) }]) {
        expect((await http().post('/api/v1/users/me/addresses').set('Authorization', as('p2')).send(bad)).status).toBe(400);
      }
    });
  });

  describe('GET /health', () => {
    it('public : 200 quand base et Redis répondent', async () => {
      const res = await http().get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok', database: 'ok', redis: 'ok' });
    });

    it('503 si un service manque, sans détail interne', async () => {
      (redis as any).ping = jest.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:6379'));
      const res = await http().get('/api/v1/health');
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: 'degraded', database: 'ok', redis: 'down' });
      expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|6379/);
    });
  });
});
