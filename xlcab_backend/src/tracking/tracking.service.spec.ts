import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SocketUser, TrackingAuthError, TrackingService } from './tracking.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const TRIP_ID = '11111111-1111-4111-8111-111111111111';
const EXP = Math.floor(Date.now() / 1000) + 900;

const passenger: SocketUser = { userId: 'passenger-1', role: 'passenger', tokenExp: EXP };
const driver: SocketUser = { userId: 'driver-1', role: 'driver', tokenExp: EXP };
const stranger: SocketUser = { userId: 'intrus', role: 'passenger', tokenExp: EXP };
const admin: SocketUser = { userId: 'admin-1', role: 'admin', tokenExp: EXP };

describe('TrackingService', () => {
  let service: TrackingService;
  let prisma: { user: any; trip: any; trackingPoint: any };
  let redis: Record<string, jest.Mock>;
  let jwt: { verify: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      trip: { findUnique: jest.fn() },
      trackingPoint: { create: jest.fn() },
    };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn(),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn(),
      geoadd: jest.fn(),
      zrem: jest.fn(),
      lpush: jest.fn(),
    };
    jwt = { verify: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        TrackingService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('access-secret') } },
      ],
    }).compile();

    service = module.get(TrackingService);
  });

  // ── Authentification ────────────────────────────────────────────────

  describe('authenticate', () => {
    const validPayload = { sub: 'passenger-1', role: 'passenger', jti: 'j1', exp: EXP };

    it('refuse une connexion sans token', async () => {
      await expect(service.authenticate(undefined)).rejects.toThrow(TrackingAuthError);
      await expect(service.authenticate('')).rejects.toThrow(TrackingAuthError);
      expect(jwt.verify).not.toHaveBeenCalled();
    });

    it('refuse un token à signature invalide ou expiré', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });
      await expect(service.authenticate('bad.token')).rejects.toThrow(TrackingAuthError);
    });

    it("vérifie avec JWT_SECRET (un refresh token, signé autrement, est refusé)", async () => {
      jwt.verify.mockReturnValue(validPayload);
      prisma.user.findUnique.mockResolvedValue({ id: 'passenger-1', role: 'passenger', deletedAt: null });

      await service.authenticate('tok');

      expect(jwt.verify).toHaveBeenCalledWith('tok', { secret: 'access-secret' });
    });

    it('refuse un token blacklisté au logout (Partie 8)', async () => {
      jwt.verify.mockReturnValue(validPayload);
      redis.get.mockImplementation(async (key: string) =>
        key === 'blacklist:tok' ? '1' : null,
      );
      await expect(service.authenticate('tok')).rejects.toThrow('Token révoqué');
    });

    it('refuse un compte supprimé', async () => {
      jwt.verify.mockReturnValue(validPayload);
      prisma.user.findUnique.mockResolvedValue({ id: 'passenger-1', role: 'passenger', deletedAt: new Date() });
      await expect(service.authenticate('tok')).rejects.toThrow(TrackingAuthError);
    });

    it('utilise le rôle en base, pas celui du token', async () => {
      // Token émis quand l'utilisateur était chauffeur, depuis suspendu.
      jwt.verify.mockReturnValue({ ...validPayload, role: 'driver' });
      prisma.user.findUnique.mockResolvedValue({ id: 'passenger-1', role: 'passenger', deletedAt: null });

      const user = await service.authenticate('tok');

      expect(user).toEqual({ userId: 'passenger-1', role: 'passenger', tokenExp: EXP });
    });
  });

  // ── Ownership ───────────────────────────────────────────────────────

  describe('findAccessibleTrip', () => {
    const trip = { id: TRIP_ID, passengerId: 'passenger-1', driverId: 'driver-1', status: 'started' };

    it('autorise le passager et le chauffeur de la course', async () => {
      prisma.trip.findUnique.mockResolvedValue(trip);
      expect(await service.findAccessibleTrip(passenger, TRIP_ID)).toEqual(trip);
      expect(await service.findAccessibleTrip(driver, TRIP_ID)).toEqual(trip);
    });

    it("refuse un utilisateur étranger à la course (même réponse qu'un trajet inexistant)", async () => {
      prisma.trip.findUnique.mockResolvedValue(trip);
      expect(await service.findAccessibleTrip(stranger, TRIP_ID)).toBeNull();

      prisma.trip.findUnique.mockResolvedValue(null);
      expect(await service.findAccessibleTrip(stranger, TRIP_ID)).toBeNull();
    });

    it("n'autorise l'admin que si allowAdmin est demandé", async () => {
      prisma.trip.findUnique.mockResolvedValue(trip);
      expect(await service.findAccessibleTrip(admin, TRIP_ID)).toBeNull();
      expect(await service.findAccessibleTrip(admin, TRIP_ID, { allowAdmin: true })).toEqual(trip);
    });

    it('refuse une course terminée ou annulée, sauf allowTerminal', async () => {
      prisma.trip.findUnique.mockResolvedValue({ ...trip, status: 'completed' });
      expect(await service.findAccessibleTrip(passenger, TRIP_ID)).toBeNull();
      expect(
        await service.findAccessibleTrip(passenger, TRIP_ID, { allowTerminal: true }),
      ).not.toBeNull();
    });
  });

  // ── Snapshot (GET /trips/:id/tracking) ──────────────────────────────

  describe('getSnapshot', () => {
    const fullTrip = (status: string) => ({
      id: TRIP_ID,
      status,
      shuttleType: 'bleue',
      passengerId: 'passenger-1',
      driverId: 'driver-1',
      vehicleId: 'vehicle-1',
      originAddress: 'Gare de Lyon, Paris',
      originLat: 48.84,
      originLng: 2.37,
      destinationAddress: 'Gare de Rouen',
      destinationLat: 49.45,
      destinationLng: 1.09,
      scheduledAt: null,
    });

    beforeEach(() => {
      prisma.user.findUnique.mockImplementation(async ({ where }: any) =>
        where.id === 'driver-1' ? { firstName: 'Nadia', phone: '+33600000000' } : null,
      );
      (prisma as any).driverProfile = { findUnique: jest.fn().mockResolvedValue({ rating: 4.9, ratingCount: 37 }) };
      (prisma as any).vehicle = {
        findUnique: jest.fn().mockResolvedValue({
          brand: 'Renault', model: 'Trafic', color: 'Gris', plate: 'AB-123-CD',
          dashcamActive: true, pmrEquipped: false,
        }),
      };
      prisma.trackingPoint.findFirst = jest.fn().mockResolvedValue({
        lat: 49.1, lng: 1.8, heading: 300, speedKmh: 92, recordedAt: new Date('2026-10-01T10:00:00Z'),
      });
    });

    const withTrip = (status: string) => {
      const trip = fullTrip(status);
      // 1er appel : contrôle d'accès ; 2e : lecture complète.
      prisma.trip.findUnique.mockResolvedValue(trip);
    };

    it('passager pendant la course : chauffeur, véhicule, téléphone et dernière position', async () => {
      withTrip('started');
      const snap = await service.getSnapshot(passenger, TRIP_ID);

      expect(snap).toMatchObject({
        tripId: TRIP_ID,
        status: 'started',
        destination: { address: 'Gare de Rouen', lat: 49.45, lng: 1.09 },
        driver: {
          firstName: 'Nadia',
          rating: 4.9,
          phone: '+33600000000',
          vehicle: { plate: 'AB-123-CD', dashcamActive: true },
        },
        lastPosition: { lat: 49.1, lng: 1.8, speed: 92 },
      });
    });

    it("le téléphone du chauffeur n'est donné qu'au passager (pas à l'admin)", async () => {
      withTrip('started');
      const snap = await service.getSnapshot(admin, TRIP_ID);
      expect(snap!.driver!.phone).toBeNull();
    });

    it('course terminée : statut lisible, mais ni position ni téléphone', async () => {
      withTrip('completed');
      const snap = await service.getSnapshot(passenger, TRIP_ID);

      expect(snap!.status).toBe('completed');
      expect(snap!.lastPosition).toBeNull();
      expect(snap!.driver!.phone).toBeNull();
      expect(prisma.trackingPoint.findFirst).not.toHaveBeenCalled();
    });

    it('refuse un utilisateur étranger à la course', async () => {
      withTrip('started');
      expect(await service.getSnapshot(stranger, TRIP_ID)).toBeNull();
    });

    it('course sans chauffeur attribué : driver null', async () => {
      prisma.trip.findUnique.mockResolvedValue({ ...fullTrip('searching'), driverId: null, vehicleId: null });
      const snap = await service.getSnapshot(passenger, TRIP_ID);
      expect(snap!.driver).toBeNull();
      expect(snap!.lastPosition).toBeNull();
    });
  });

  // ── Courses programmées : suivi activé à l'approche ────────────────

  describe('activation du suivi à T − 60 min', () => {
    beforeEach(() => {
      (prisma.trip as any).findFirst = jest.fn();
      redis.get.mockResolvedValue(null); // aucune course active en Redis
    });

    it('course acceptée qui approche : suivi activé automatiquement', async () => {
      (prisma.trip as any).findFirst.mockResolvedValue({ id: TRIP_ID });
      const tripId = await service.recordDriverLocation('driver-1', { lat: 48.85, lng: 2.35 });

      expect(tripId).toBe(TRIP_ID);
      const where = (prisma.trip as any).findFirst.mock.calls[0][0].where;
      expect(where).toMatchObject({ driverId: 'driver-1', status: { in: ['accepted', 'started'] } });
      expect(where.scheduledAt.lte.getTime()).toBeLessThanOrEqual(Date.now() + 60 * 60_000);
      expect(redis.set).toHaveBeenCalledWith('driver:trip:driver-1', TRIP_ID, 'EX', 12 * 3600);
    });

    it('vérification limitée à une fois par minute (positions toutes les 10 s)', async () => {
      redis.set.mockImplementation(async (key: string) => (key.startsWith('driver:next-trip-check') ? null : 'OK'));
      expect(await service.recordDriverLocation('driver-1', { lat: 1, lng: 2 })).toBeNull();
      expect((prisma.trip as any).findFirst).not.toHaveBeenCalled();
    });

    it('base indisponible : la position est tout de même enregistrée', async () => {
      (prisma.trip as any).findFirst.mockRejectedValue(new Error('db down'));
      await expect(service.recordDriverLocation('driver-1', { lat: 1, lng: 2 })).resolves.toBeNull();
      expect(redis.geoadd).toHaveBeenCalled();
    });
  });

  // ── SOS ─────────────────────────────────────────────────────────────

  describe('queueSos', () => {
    const alert = {
      tripId: TRIP_ID, userId: 'passenger-1', role: 'passenger',
      position: { lat: 48.85, lng: 2.35 }, timestamp: 1,
    };

    it('enregistre un incident à suivre puis alimente la file du worker SOS', async () => {
      (prisma as any).incident = { create: jest.fn().mockResolvedValue({ id: 'inc-1' }) };
      expect(await service.queueSos(alert)).toBe('inc-1');
      expect((prisma as any).incident.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'sos', tripId: TRIP_ID, lat: 48.85 }) }),
      );
      expect(redis.lpush).toHaveBeenCalledWith('sos:queue', expect.stringContaining('"incidentId":"inc-1"'));
    });

    it('base indisponible : l’alerte part QUAND MÊME (jamais bloquée)', async () => {
      (prisma as any).incident = { create: jest.fn().mockRejectedValue(new Error('db down')) };
      expect(await service.queueSos(alert)).toBeNull();
      expect(redis.lpush).toHaveBeenCalledWith('sos:queue', expect.stringContaining('"tripId"'));
    });
  });

  // ── Positions et limites ────────────────────────────────────────────

  describe('positions et limites de débit', () => {
    it('throttle les positions via SET NX PX 1000', async () => {
      expect(await service.acceptLocation('driver-1')).toBe(true);
      expect(redis.set).toHaveBeenCalledWith('ws:loc:throttle:driver-1', '1', 'PX', 1000, 'NX');

      redis.set.mockResolvedValueOnce(null); // clé déjà présente
      expect(await service.acceptLocation('driver-1')).toBe(false);
    });

    it('met à jour le géo-index et retourne la course active du chauffeur', async () => {
      redis.get.mockResolvedValue(TRIP_ID);
      const tripId = await service.recordDriverLocation('driver-1', { lat: 48.85, lng: 2.35 });

      expect(redis.geoadd).toHaveBeenCalledWith('drivers:online', 2.35, 48.85, 'driver-1');
      expect(redis.set).toHaveBeenCalledWith('driver:seen:driver-1', '1', 'EX', 30);
      expect(tripId).toBe(TRIP_ID);
    });

    it("n'interrompt pas le suivi si l'historisation échoue", async () => {
      prisma.trackingPoint.create.mockRejectedValue(new Error('db down'));
      await expect(
        service.saveTrackingPoint(TRIP_ID, 'driver-1', { lat: 1, lng: 2 }),
      ).resolves.toBeUndefined();
    });

    it('limite les messages à 20/min et les SOS à 3/min', async () => {
      redis.incr.mockResolvedValue(21);
      expect(await service.allowMessage('u')).toBe(false);
      redis.incr.mockResolvedValue(3);
      expect(await service.allowSos('u')).toBe(true);
      redis.incr.mockResolvedValue(4);
      expect(await service.allowSos('u')).toBe(false);
    });
  });
});
