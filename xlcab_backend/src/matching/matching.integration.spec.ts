import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { io, Socket as ClientSocket } from 'socket.io-client';
import * as request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FakeRedis, fakeTripTable } from '../testing/fake-redis';
import { TrackingModule } from '../tracking/tracking.module';
import { MatchingModule } from './matching.module';

// Flux complet, de bout en bout : vrai HTTP (guards JWT + RBAC du
// Module 2), vraies sockets (Module 3), vrai dispatch (Module 4).
// Seuls PostgreSQL et Redis sont simulés en mémoire.

const JWT_SECRET = 'integration-access-secret';
const TRIP_ID = '44444444-4444-4444-8444-444444444444';

const USERS: Record<string, { id: string; role: string; deletedAt: null }> = {
  'passenger-a': { id: 'passenger-a', role: 'passenger', deletedAt: null },
  'passenger-b': { id: 'passenger-b', role: 'passenger', deletedAt: null },
  'driver-1': { id: 'driver-1', role: 'driver', deletedAt: null },
  'driver-2': { id: 'driver-2', role: 'driver', deletedAt: null },
};

describe('Matching + dispatch (intégration)', () => {
  let app: INestApplication;
  let url: string;
  let redis: FakeRedis;
  let trips: Record<string, any>;
  const jwt = new JwtService();
  const sockets: ClientSocket[] = [];

  const tokenFor = (userId: string) =>
    jwt.sign(
      { sub: userId, role: USERS[userId].role, jti: `jti-${userId}` },
      { secret: JWT_SECRET, expiresIn: '15m' },
    );

  const post = (path: string, userId: string, body: object = {}) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${tokenFor(userId)}`)
      .send(body);

  function connect(userId: string): Promise<ClientSocket> {
    const socket = io(url, {
      path: '/ws/tracking',
      auth: { token: tokenFor(userId) },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });
  }

  function waitFor<T = any>(socket: ClientSocket, event: string, ms = 2000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`"${event}" non reçu`)), ms);
      socket.once(event, (data: T) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  function record(socket: ClientSocket, event: string): any[] {
    const received: any[] = [];
    socket.on(event, (data) => received.push(data));
    return received;
  }

  beforeAll(async () => {
    redis = new FakeRedis();
    trips = {};

    const prisma = {
      user: { findUnique: async ({ where }: any) => USERS[where.id] ?? null },
      trip: fakeTripTable(trips),
      jurisdictionConfig: { findUnique: async () => ({ code: 'FR', requiresVtcCard: true }) },
      driverProfile: {
        findMany: async ({ where }: any) => where.id.in.map((id: string) => ({ id })),
      },
      vehicle: {
        findMany: async ({ where }: any) =>
          where.driverId.in.map((id: string) => ({ id: `vehicle-${id}`, driverId: id })),
      },
      trackingPoint: { create: async () => ({}) },
    };

    @Global()
    @Module({
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
      exports: [PrismaService, RedisService],
    })
    class FakeInfraModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET, JWT_REFRESH_SECRET: 'integration-refresh-secret' })],
        }),
        FakeInfraModule,
        AuthModule, // enregistre la stratégie Passport "jwt"
        TrackingModule,
        MatchingModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Même configuration que main.ts.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0);
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    redis.store.clear();
    redis.lists.clear();
    // driver-1 est le plus proche, driver-2 le suivant ; tous deux en ligne.
    redis.geoResult = [['driver-1', '1.5'], ['driver-2', '4.2']];
    redis.store.set('driver:seen:driver-1', '1');
    redis.store.set('driver:seen:driver-2', '1');
    trips[TRIP_ID] = {
      id: TRIP_ID,
      passengerId: 'passenger-a',
      status: 'pending',
      type: 'passenger',
      shuttleType: 'bleue',
      jurisdiction: 'FR',
      originLat: 48.844,
      originLng: 2.374,
      originAddress: 'Gare de Lyon, Paris',
      destinationAddress: 'Gare de Rouen',
      distanceKm: 135,
      scheduledAt: null,
      totalPriceCents: 12150,
      passengerBooking: { seats: 2 },
    };
  });

  afterEach(() => sockets.splice(0).forEach((s) => s.disconnect()));

  afterAll(async () => {
    await app.close();
  });

  it('flux complet : match → offre → refus → offre suivante → acceptation → statut au passager', async () => {
    const passenger = await connect('passenger-a');
    const driver1 = await connect('driver-1');
    const driver2 = await connect('driver-2');
    const driver2Offers = record(driver2, 'mission:offer');
    await passenger.emitWithAck('subscribe:trip', { tripId: TRIP_ID });

    // 1. Le passager lance la recherche : seul le plus proche est sollicité.
    const offer1 = waitFor(driver1, 'mission:offer');
    const match = await post('/api/v1/trips/match', 'passenger-a', { tripId: TRIP_ID });
    expect(match.status).toBe(202);
    expect(match.body).toEqual({ tripId: TRIP_ID, status: 'searching' });
    await expect(offer1).resolves.toMatchObject({ tripId: TRIP_ID, seats: 2, pickupDistanceKm: 1.5 });
    expect(driver2Offers).toEqual([]);

    // 2. driver-2 tente d'accepter une offre qui ne lui a pas été faite.
    expect((await post(`/api/v1/trips/${TRIP_ID}/accept`, 'driver-2')).status).toBe(409);

    // 3. driver-1 refuse : l'offre passe à driver-2.
    const offer2 = waitFor(driver2, 'mission:offer');
    expect((await post(`/api/v1/trips/${TRIP_ID}/refuse`, 'driver-1')).status).toBe(200);
    await expect(offer2).resolves.toMatchObject({ tripId: TRIP_ID });

    // 4. driver-1 ne peut plus accepter après son refus.
    expect((await post(`/api/v1/trips/${TRIP_ID}/accept`, 'driver-1')).status).toBe(409);

    // 5. driver-2 accepte : le passager abonné reçoit le statut.
    const status = waitFor(passenger, 'status');
    const accept = await post(`/api/v1/trips/${TRIP_ID}/accept`, 'driver-2');
    expect(accept.status).toBe(200);
    expect(accept.body).toEqual({ tripId: TRIP_ID, status: 'accepted', vehicleId: 'vehicle-driver-2' });
    await expect(status).resolves.toMatchObject({ tripId: TRIP_ID, status: 'accepted' });

    // 6. Les positions de driver-2 parviennent désormais au passager (Module 3).
    const position = waitFor(passenger, 'position');
    driver2.emit('driver:location', { lat: 48.85, lng: 2.37 });
    await expect(position).resolves.toMatchObject({ tripId: TRIP_ID, driverId: 'driver-2' });
  });

  it("un autre passager ne peut pas lancer la recherche sur le trajet d'autrui", async () => {
    const res = await post('/api/v1/trips/match', 'passenger-b', { tripId: TRIP_ID });
    expect(res.status).toBe(404);
    expect(trips[TRIP_ID].status).toBe('pending');
  });

  it('un passager ne peut pas accepter une course (RBAC : chauffeurs uniquement)', async () => {
    const res = await post(`/api/v1/trips/${TRIP_ID}/accept`, 'passenger-a');
    expect(res.status).toBe(403);
  });

  it('refuse les requêtes sans token et les champs non déclarés', async () => {
    const anonymous = await request(app.getHttpServer())
      .post('/api/v1/trips/match')
      .send({ tripId: TRIP_ID });
    expect(anonymous.status).toBe(401);

    // Le client ne peut pas élargir la recherche ni imposer un chauffeur.
    const injected = await post('/api/v1/trips/match', 'passenger-a', {
      tripId: TRIP_ID,
      radiusKm: 500,
      driverId: 'driver-2',
    });
    expect(injected.status).toBe(400);
  });
});
