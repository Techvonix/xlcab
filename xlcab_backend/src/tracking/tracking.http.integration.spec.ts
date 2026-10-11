import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FakeRedis } from '../testing/fake-redis';
import { TrackingModule } from './tracking.module';

// GET /api/v1/trips/:id/tracking de bout en bout : vrai HTTP, guard JWT
// du Module 2. PostgreSQL et Redis simulés.

const JWT_SECRET = 'tracking-http-secret';
const TRIP_ID = '55555555-5555-4555-8555-555555555555';

describe('GET /api/v1/trips/:id/tracking (intégration)', () => {
  let app: INestApplication;
  const jwt = new JwtService();
  const tokenFor = (sub: string, role = 'passenger') =>
    jwt.sign({ sub, role, jti: `jti-${sub}` }, { secret: JWT_SECRET });

  const get = (path: string, userId?: string) => {
    const req = request(app.getHttpServer()).get(path);
    return userId ? req.set('Authorization', `Bearer ${tokenFor(userId)}`) : req;
  };

  beforeAll(async () => {
    const trip = {
      id: TRIP_ID, status: 'started', shuttleType: 'bleue',
      passengerId: 'passenger-a', driverId: 'driver-1', vehicleId: 'vehicle-1',
      originAddress: 'Gare de Lyon, Paris', originLat: 48.84, originLng: 2.37,
      destinationAddress: 'Gare de Rouen', destinationLat: 49.45, destinationLng: 1.09,
      scheduledAt: null,
    };
    const prisma = {
      trip: { findUnique: async ({ where }: any) => (where.id === TRIP_ID ? trip : null) },
      user: {
        findUnique: async ({ where }: any) =>
          where.id === 'driver-1' ? { firstName: 'Nadia', phone: '+33600000000' } : null,
      },
      driverProfile: { findUnique: async () => ({ rating: 4.9 }) },
      vehicle: {
        findUnique: async () => ({
          brand: 'Renault', model: 'Trafic', color: 'Gris', plate: 'AB-123-CD',
          dashcamActive: true, pmrEquipped: false,
        }),
      },
      trackingPoint: {
        findFirst: async () => ({ lat: 49.1, lng: 1.8, heading: 300, speedKmh: 92, recordedAt: new Date('2026-10-01T10:00:00Z') }),
      },
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
          load: [() => ({ JWT_SECRET, JWT_REFRESH_SECRET: 'r' })],
        }),
        FakeInfraModule,
        AuthModule,
        TrackingModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it('le passager reçoit chauffeur, véhicule, téléphone et dernière position', async () => {
    const res = await get(`/api/v1/trips/${TRIP_ID}/tracking`, 'passenger-a');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      tripId: TRIP_ID,
      status: 'started',
      driver: { firstName: 'Nadia', phone: '+33600000000', vehicle: { plate: 'AB-123-CD' } },
      lastPosition: { lat: 49.1, lng: 1.8, speed: 92 },
    });
    // Données non nécessaires jamais exposées.
    expect(res.body.driver).not.toHaveProperty('lastName');
    expect(res.body).not.toHaveProperty('passengerId');
  });

  it("un autre passager reçoit 404, comme pour un trajet inexistant", async () => {
    expect((await get(`/api/v1/trips/${TRIP_ID}/tracking`, 'passenger-b')).status).toBe(404);
    const unknown = '66666666-6666-4666-8666-666666666666';
    expect((await get(`/api/v1/trips/${unknown}/tracking`, 'passenger-a')).status).toBe(404);
  });

  it('exige une authentification et un identifiant valide', async () => {
    expect((await get(`/api/v1/trips/${TRIP_ID}/tracking`)).status).toBe(401);
    expect((await get('/api/v1/trips/pas-un-uuid/tracking', 'passenger-a')).status).toBe(400);
  });
});
