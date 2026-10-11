import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FakeRedis } from '../testing/fake-redis';
import { BookingsModule } from './bookings.module';

// Devis de bout en bout : vrai HTTP (JWT + ValidationPipe comme main.ts),
// vrais PricingService et RoutingService. Google Routes est simulé via
// fetch ; PostgreSQL et Redis sont en mémoire.

const JWT_SECRET = 'bookings-access-secret';

describe('POST /api/v1/bookings/passenger/quote (intégration)', () => {
  let app: INestApplication;
  let fetchMock: jest.SpyInstance;
  const jwt = new JwtService();
  const token = jwt.sign({ sub: 'passenger-a', role: 'passenger', jti: 'j1' }, { secret: JWT_SECRET });

  const body = (over: object = {}) => ({
    origin: { lat: 48.8443, lng: 2.3744 },
    destination: { lat: 49.4488, lng: 1.0942 },
    shuttleType: 'bleue',
    scheduledAt: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
    seats: 2,
    ...over,
  });

  const quote = (payload: object) =>
    request(app.getHttpServer())
      .post('/api/v1/bookings/passenger/quote')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

  beforeAll(async () => {
    const prisma = {
      user: { findUnique: async () => ({ jurisdiction: 'FR', deletedAt: null }) },
      jurisdictionConfig: {
        findUnique: async () => ({
          code: 'FR', minTripKm: 60, vatPassengerRate: 0, vatParcelRate: 20, currency: 'EUR',
        }),
      },
      // Aucun tarif saisi : grille par défaut.
      tariff: { findFirst: async () => null },
    };

    @Global()
    @Module({
      providers: [
        { provide: PrismaService, useValue: prisma },
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
          load: [() => ({ JWT_SECRET, JWT_REFRESH_SECRET: 'r', GOOGLE_MAPS_API_KEY: 'server-key' })],
        }),
        FakeInfraModule,
        AuthModule,
        BookingsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (_url, init: any) => {
      // Distance renvoyée selon la destination demandée.
      const dest = JSON.parse(init.body).destination.location.latLng;
      const meters = dest.latitude > 49 ? 135_420 : 42_000;
      return { ok: true, status: 200, json: async () => ({ routes: [{ distanceMeters: meters, duration: '3600s' }] }) } as Response;
    });
  });

  afterEach(() => fetchMock.mockRestore());
  afterAll(() => app.close());

  it('renvoie distance, durée et prix TTC avec la TVA ventilée', async () => {
    const res = await quote(body({ withParcel: true }));
    expect(res.status).toBe(200);
    // 135,4 km × 90 c = 12 186 c (TVA 0 %) + colis 800 c (TVA 20 % = 160 c)
    expect(res.body).toEqual({
      distanceKm: 135.4,
      durationMin: 60,
      priceCents: 12986,
      vatCents: 160,
      totalCents: 13146,
      currency: 'EUR',
      vatLines: [
        { regime: 'passenger', baseCents: 12186, ratePercent: 0, vatCents: 0 },
        { regime: 'parcel', baseCents: 800, ratePercent: 20, vatCents: 160 },
      ],
    });
  });

  it('refuse un trajet de moins de 60 km (distance routière calculée par le serveur)', async () => {
    const res = await quote(body({ destination: { lat: 48.5, lng: 2.6 } }));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Distance minimale : 60 km');
  });

  it('refuse une distance ou un prix envoyés par le client', async () => {
    expect((await quote(body({ distanceKm: 61 }))).status).toBe(400);
    expect((await quote(body({ totalCents: 1 }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('valide les données : 1 à 7 passagers, navette connue, coordonnées valides', async () => {
    expect((await quote(body({ seats: 0 }))).status).toBe(400);
    expect((await quote(body({ seats: 8 }))).status).toBe(400);
    expect((await quote(body({ shuttleType: 'violette' }))).status).toBe(400);
    expect((await quote(body({ origin: { lat: 200, lng: 2 } }))).status).toBe(400);
  });

  it('exige une authentification', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/bookings/passenger/quote').send(body());
    expect(res.status).toBe(401);
  });
});
