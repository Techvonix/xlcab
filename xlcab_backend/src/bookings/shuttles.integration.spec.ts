import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { MatchingService } from '../matching/matching.service';
import { PricingService } from '../matching/pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FakeRedis } from '../testing/fake-redis';
import { memoryPrisma } from '../testing/memory-prisma';
import { ShuttlesController, ShuttlesService } from './shuttles';

// Écran 5 : disponibilité et prix « à partir de » de chaque navette.

const JWT_SECRET = 'shuttles-secret';

describe('GET /api/v1/shuttles (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  const matching = { findEligibleDrivers: jest.fn() };
  const jwt = new JwtService();
  const as = (sub: string) => `Bearer ${jwt.sign({ sub, role: 'passenger', jti: `j-${sub}` }, { secret: JWT_SECRET })}`;
  const http = () => request(app.getHttpServer());

  beforeEach(async () => {
    db = memoryPrisma();
    db.user.rows.push({ id: 'p1', email: 'lea@x.fr', role: 'passenger', jurisdiction: 'FR' });
    matching.findEligibleDrivers.mockReset();

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
        AuthModule,
      ],
      controllers: [ShuttlesController],
      providers: [ShuttlesService, PricingService, { provide: MatchingService, useValue: matching }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterEach(() => app.close());

  it('sans position : prix à partir de (60 km, grille par défaut), disponibilité inconnue', async () => {
    const res = await http().get('/api/v1/shuttles').set('Authorization', as('p1'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      jurisdiction: 'FR',
      minTripKm: 60,
      currency: 'EUR',
      shuttles: [
        { type: 'rose', available: null, fromCents: 7200 },
        { type: 'bleue', available: null, fromCents: 5400 },
        { type: 'orange', available: null, fromCents: 9000 },
        { type: 'accessibility', available: null, fromCents: 6000 },
      ],
    });
    expect(matching.findEligibleDrivers).not.toHaveBeenCalled();
  });

  it('avec position : oui / non par navette, même filtre que le dispatch (1 place, maintenant)', async () => {
    matching.findEligibleDrivers.mockImplementation(async ({ shuttleType }) =>
      shuttleType === 'bleue' ? [{ driverId: 'd1', vehicleId: 'v1', distanceKm: 2.4 }] : [],
    );
    const res = await http().get('/api/v1/shuttles?lat=48.85&lng=2.35').set('Authorization', as('p1'));
    expect(res.body.shuttles.map((s: any) => [s.type, s.available])).toEqual([
      ['rose', false],
      ['bleue', true],
      ['orange', false],
      ['accessibility', false],
    ]);
    expect(matching.findEligibleDrivers).toHaveBeenCalledWith({ lat: 48.85, lng: 2.35, shuttleType: 'bleue', jurisdiction: 'FR', seats: 1, scheduledAt: null });
    // Jamais d'identifiant, de nombre ni de distance de chauffeur.
    expect(JSON.stringify(res.body)).not.toMatch(/d1|v1|2\.4/);
  });

  it('Redis indisponible : disponibilité inconnue plutôt que « indisponible »', async () => {
    matching.findEligibleDrivers.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await http().get('/api/v1/shuttles?lat=48.85&lng=2.35').set('Authorization', as('p1'));
    expect(res.status).toBe(200);
    expect(res.body.shuttles.every((s: any) => s.available === null)).toBe(true);
  });

  it('tarif publié par l’équipe : le prix à partir de suit', async () => {
    db.tariff.rows.push({
      id: 't1', jurisdiction: 'FR', effectiveFrom: new Date(Date.now() - 1000), createdBy: 'a1', reason: 'carburant',
      ratesPerKm: { rose: 130, bleue: 95, orange: 160, accessibility: 105 },
      childSeatCents: 500, wifiCents: 300, extraLuggageCents: 500, parcelFeeCents: 800, sharedParcelCents: 800,
    });
    const res = await http().get('/api/v1/shuttles').set('Authorization', as('p1'));
    expect(res.body.shuttles.find((s: any) => s.type === 'bleue').fromCents).toBe(5700);
  });

  it('position invalide → 400 ; non connecté → 401', async () => {
    expect((await http().get('/api/v1/shuttles?lat=95&lng=2').set('Authorization', as('p1'))).status).toBe(400);
    expect((await http().get('/api/v1/shuttles')).status).toBe(401);
  });
});
