import { Global, INestApplication, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TrackingModule } from './tracking.module';

// Test d'intégration : vraie application Nest, vrai serveur Socket.io,
// vrais clients socket.io-client et vrais JWT signés. Seuls PostgreSQL
// et Redis sont remplacés par des faux en mémoire.

const JWT_SECRET = 'integration-test-secret';
const TRIP_ID = '22222222-2222-4222-8222-222222222222';

const USERS: Record<string, { id: string; role: string; deletedAt: Date | null }> = {
  'passenger-a': { id: 'passenger-a', role: 'passenger', deletedAt: null },
  'passenger-b': { id: 'passenger-b', role: 'passenger', deletedAt: null },
  'driver-1': { id: 'driver-1', role: 'driver', deletedAt: null },
  'admin-1': { id: 'admin-1', role: 'admin', deletedAt: null },
};

// Le trajet appartient au passager A, conduit par driver-1.
const TRIPS: Record<string, object> = {
  [TRIP_ID]: { id: TRIP_ID, passengerId: 'passenger-a', driverId: 'driver-1', status: 'started' },
};

/** Faux Redis : uniquement les commandes utilisées par TrackingService. */
function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes('NX') && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    },
    del: async (key: string) => (store.delete(key) ? 1 : 0),
    incr: async (key: string) => {
      const n = Number(store.get(key) ?? 0) + 1;
      store.set(key, String(n));
      return n;
    },
    expire: async () => 1,
    geoadd: async () => 1,
    zrem: async () => 1,
    lpush: jest.fn(async () => 1),
  };
}

const fakePrisma = {
  user: { findUnique: async ({ where }: any) => USERS[where.id] ?? null },
  trip: { findUnique: async ({ where }: any) => TRIPS[where.id] ?? null },
  trackingPoint: { create: async () => ({}) },
};

describe('Tracking WebSocket (intégration)', () => {
  let app: INestApplication;
  let url: string;
  let redis: ReturnType<typeof fakeRedis>;
  const jwt = new JwtService();
  const openSockets: ClientSocket[] = [];

  const tokenFor = (userId: string) =>
    jwt.sign(
      { sub: userId, role: USERS[userId].role, jti: `jti-${userId}` },
      { secret: JWT_SECRET, expiresIn: '15m' },
    );

  /** Ouvre une vraie connexion ; rejette si le handshake est refusé. */
  function connect(token?: string, locale?: string): Promise<ClientSocket> {
    const socket = io(url, {
      path: '/ws/tracking',
      auth: { ...(token ? { token } : {}), ...(locale ? { locale } : {}) },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    openSockets.push(socket);
    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });
  }

  /** Attend un événement, ou échoue après `ms` millisecondes. */
  function waitFor<T = any>(socket: ClientSocket, event: string, ms = 2000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`"${event}" non reçu`)), ms);
      socket.once(event, (data: T) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  /** Enregistre tout ce qu'un socket reçoit pour un événement donné. */
  function record(socket: ClientSocket, event: string): any[] {
    const received: any[] = [];
    socket.on(event, (data) => received.push(data));
    return received;
  }

  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

  beforeAll(async () => {
    redis = fakeRedis();

    // Remplace les modules globaux PrismaModule / RedisModule de l'app.
    @Global()
    @Module({
      providers: [
        { provide: PrismaService, useValue: fakePrisma },
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
          load: [() => ({ JWT_SECRET })],
        }),
        FakeInfraModule,
        TrackingModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0); // port libre choisi par l'OS
    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
  });

  afterEach(() => {
    openSockets.splice(0).forEach((s) => s.disconnect());
    redis.store.clear();
    redis.lpush.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuse le handshake sans token ou avec un token forgé', async () => {
    await expect(connect()).rejects.toThrow('Non autorisé');
    const forged = jwt.sign({ sub: 'admin-1', role: 'admin', jti: 'x' }, { secret: 'mauvais-secret' });
    await expect(connect(forged)).rejects.toThrow('Non autorisé');
  });

  it('app en anglais (auth.locale) : erreurs de connexion et d’abonnement en anglais', async () => {
    await expect(connect(undefined, 'en')).rejects.toThrow('Not authorised');
    const intruder = await connect(tokenFor('passenger-b'), 'en');
    const error = waitFor(intruder, 'exception');
    await expect(intruder.timeout(500).emitWithAck('subscribe:trip', { tripId: TRIP_ID })).rejects.toThrow();
    await expect(error).resolves.toMatchObject({ status: 'error', message: 'Trip not found or access denied' });
  });

  it("un utilisateur connecté ne peut PAS s'abonner au trajet d'un autre passager", async () => {
    const owner = await connect(tokenFor('passenger-a'));
    const intruder = await connect(tokenFor('passenger-b'));
    const driver = await connect(tokenFor('driver-1'));

    // Le propriétaire s'abonne normalement (accusé de réception).
    await expect(owner.emitWithAck('subscribe:trip', { tripId: TRIP_ID })).resolves.toEqual({
      subscribed: true,
      tripId: TRIP_ID,
    });

    // L'intrus reçoit une erreur et aucun accusé de réception.
    const error = waitFor(intruder, 'exception');
    await expect(
      intruder.timeout(500).emitWithAck('subscribe:trip', { tripId: TRIP_ID }),
    ).rejects.toThrow();
    await expect(error).resolves.toMatchObject({
      status: 'error',
      message: 'Trajet introuvable ou accès refusé',
    });

    // Preuve par l'effet : le chauffeur publie une position sur ce
    // trajet ; le propriétaire la reçoit, l'intrus non.
    const intruderPositions = record(intruder, 'position');
    redis.store.set('driver:trip:driver-1', TRIP_ID); // posé par Trips en prod
    const ownerPosition = waitFor(owner, 'position');
    driver.emit('driver:location', { lat: 48.8566, lng: 2.3522, heading: 90, speed: 70 });

    await expect(ownerPosition).resolves.toMatchObject({
      tripId: TRIP_ID,
      driverId: 'driver-1',
      lat: 48.8566,
      lng: 2.3522,
    });
    await pause(200);
    expect(intruderPositions).toEqual([]);
  });

  it("un admin reçoit les alertes SOS, les autres utilisateurs non", async () => {
    const admin = await connect(tokenFor('admin-1'));
    const passenger = await connect(tokenFor('passenger-a'));
    const bystander = await connect(tokenFor('passenger-b'));
    const bystanderAlerts = record(bystander, 'sos');

    const adminAlert = waitFor(admin, 'sos');
    await expect(
      passenger.emitWithAck('sos', { tripId: TRIP_ID, lat: 48.8566, lng: 2.3522 }),
    ).resolves.toEqual({ received: true });

    await expect(adminAlert).resolves.toEqual({
      alert: expect.objectContaining({
        tripId: TRIP_ID,
        userId: 'passenger-a', // identité issue du token, pas du client
        role: 'passenger',
        position: { lat: 48.8566, lng: 2.3522 },
      }),
    });
    expect(redis.lpush).toHaveBeenCalledWith('sos:queue', expect.stringContaining('passenger-a'));

    await pause(200);
    expect(bystanderAlerts).toEqual([]);
  });
});
