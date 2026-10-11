import { WsException } from '@nestjs/websockets';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ADMIN_ROOM, TrackingGateway, isOriginAllowed } from './tracking.gateway';
import { SocketUser, TrackingService } from './tracking.service';
import { ChatMessageDto, DriverLocationDto, SosDto, TripRefDto } from './dto/tracking.dto';

const TRIP_ID = '11111111-1111-4111-8111-111111111111';
const TRIP = { id: TRIP_ID, passengerId: 'passenger-1', driverId: 'driver-1', status: 'started' };

const inFifteenMinutes = () => Math.floor(Date.now() / 1000) + 900;
const asPassenger = (): SocketUser => ({ userId: 'passenger-1', role: 'passenger', tokenExp: inFifteenMinutes() });
const asDriver = (): SocketUser => ({ userId: 'driver-1', role: 'driver', tokenExp: inFifteenMinutes() });
const asAdmin = (): SocketUser => ({ userId: 'admin-1', role: 'admin', tokenExp: inFifteenMinutes() });

/** Socket factice : on n'a besoin que de ce que la gateway utilise. */
function fakeSocket(user?: SocketUser, token?: string): any {
  return {
    data: { user },
    handshake: { auth: { token } },
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
}

describe('TrackingGateway', () => {
  let gateway: TrackingGateway;
  let tracking: jest.Mocked<TrackingService>;
  let emitted: { room: string; event: string; data: any }[];
  let fetchSockets: jest.Mock;

  beforeEach(() => {
    tracking = {
      authenticate: jest.fn(),
      findAccessibleTrip: jest.fn(),
      acceptLocation: jest.fn().mockResolvedValue(true),
      recordDriverLocation: jest.fn().mockResolvedValue(null),
      saveTrackingPoint: jest.fn(),
      removeDriverFromIndex: jest.fn(),
      allowMessage: jest.fn().mockResolvedValue(true),
      allowSos: jest.fn().mockResolvedValue(true),
      queueSos: jest.fn().mockResolvedValue('incident-1'),
    } as any;

    emitted = [];
    fetchSockets = jest.fn().mockResolvedValue([]);
    gateway = new TrackingGateway(tracking);
    gateway.server = {
      to: jest.fn((room: string) => ({
        emit: (event: string, data: any) => emitted.push({ room, event, data }),
      })),
      in: jest.fn(() => ({ fetchSockets })),
    } as any;
  });

  afterEach(() => jest.useRealTimers());

  // ── Handshake ───────────────────────────────────────────────────────

  describe('authentification au handshake', () => {
    function middleware() {
      const server = { use: jest.fn() } as any;
      gateway.afterInit(server);
      return server.use.mock.calls[0][0];
    }

    it('refuse la connexion si le token est invalide (avant tout message)', async () => {
      tracking.authenticate.mockRejectedValue(new Error('Token invalide'));
      const socket = fakeSocket(undefined, 'bad');
      const next = jest.fn();

      await middleware()(socket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(socket.data.user).toBeUndefined();
    });

    it("attache l'utilisateur à la socket si le token est valide", async () => {
      const user = asPassenger();
      tracking.authenticate.mockResolvedValue(user);
      const socket = fakeSocket(undefined, 'good');
      const next = jest.fn();

      await middleware()(socket, next);

      expect(tracking.authenticate).toHaveBeenCalledWith('good');
      expect(next).toHaveBeenCalledWith();
      expect(socket.data.user).toBe(user);
    });
  });

  // ── Connexion / déconnexion ─────────────────────────────────────────

  describe('connexion', () => {
    // handleConnection arme un timer d'expiration de 15 min : horloge
    // factice pour ne pas laisser de timer actif après les tests.
    beforeEach(() => jest.useFakeTimers());

    it("fait rejoindre la salle admin uniquement aux admins", () => {
      const adminSocket = fakeSocket(asAdmin());
      const passengerSocket = fakeSocket(asPassenger());

      gateway.handleConnection(adminSocket);
      gateway.handleConnection(passengerSocket);

      expect(adminSocket.join).toHaveBeenCalledWith(ADMIN_ROOM);
      expect(passengerSocket.join).not.toHaveBeenCalledWith(ADMIN_ROOM);
    });

    it("coupe la socket à l'expiration de l'access token", () => {
      const socket = fakeSocket(asPassenger());

      gateway.handleConnection(socket);
      expect(socket.disconnect).not.toHaveBeenCalled();

      jest.advanceTimersByTime(900 * 1000 + 1);
      expect(socket.emit).toHaveBeenCalledWith('auth:expired');
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('retire le chauffeur du géo-index quand sa dernière socket se ferme', async () => {
      const socket = fakeSocket(asDriver());
      gateway.handleConnection(socket);

      fetchSockets.mockResolvedValueOnce([{}]); // une autre socket encore ouverte
      await gateway.handleDisconnect(socket);
      expect(tracking.removeDriverFromIndex).not.toHaveBeenCalled();

      fetchSockets.mockResolvedValueOnce([]);
      await gateway.handleDisconnect(socket);
      expect(tracking.removeDriverFromIndex).toHaveBeenCalledWith('driver-1');
    });
  });

  // ── subscribe:trip ──────────────────────────────────────────────────

  describe('subscribe:trip', () => {
    it("refuse l'abonnement à une course dont on n'est pas participant", async () => {
      tracking.findAccessibleTrip.mockResolvedValue(null);
      const socket = fakeSocket(asPassenger());

      await expect(gateway.onSubscribe(socket, { tripId: TRIP_ID })).rejects.toThrow(WsException);
      expect(socket.join).not.toHaveBeenCalledWith(`trip:${TRIP_ID}`);
    });

    it('abonne un participant à la salle du trajet (admins autorisés)', async () => {
      tracking.findAccessibleTrip.mockResolvedValue(TRIP);
      const socket = fakeSocket(asPassenger());

      const res = await gateway.onSubscribe(socket, { tripId: TRIP_ID });

      expect(tracking.findAccessibleTrip).toHaveBeenCalledWith(expect.anything(), TRIP_ID, { allowAdmin: true });
      expect(socket.join).toHaveBeenCalledWith(`trip:${TRIP_ID}`);
      expect(res).toEqual({ subscribed: true, tripId: TRIP_ID });
    });
  });

  // ── driver:location ─────────────────────────────────────────────────

  describe('driver:location', () => {
    const loc = { lat: 48.85, lng: 2.35, heading: 90, speed: 80 };

    it("refuse les positions envoyées par un non-chauffeur", async () => {
      await expect(gateway.onLocation(fakeSocket(asPassenger()), loc)).rejects.toThrow(WsException);
      expect(tracking.recordDriverLocation).not.toHaveBeenCalled();
    });

    it('ignore les positions trop rapprochées (throttle)', async () => {
      tracking.acceptLocation.mockResolvedValue(false);
      const res = await gateway.onLocation(fakeSocket(asDriver()), loc);
      expect(res).toEqual({ accepted: false, reason: 'throttled' });
      expect(tracking.recordDriverLocation).not.toHaveBeenCalled();
    });

    it('diffuse la position à la salle du trajet actif, avec le driverId du token', async () => {
      tracking.recordDriverLocation.mockResolvedValue(TRIP_ID);

      await gateway.onLocation(fakeSocket(asDriver()), loc);

      expect(emitted).toEqual([
        {
          room: `trip:${TRIP_ID}`,
          event: 'position',
          data: expect.objectContaining({ tripId: TRIP_ID, driverId: 'driver-1', lat: 48.85, lng: 2.35, speed: 80, eta: null }),
        },
      ]);
      expect(tracking.saveTrackingPoint).toHaveBeenCalledWith(TRIP_ID, 'driver-1', loc);
    });

    it("ne diffuse rien hors course (mise à jour du géo-index seulement)", async () => {
      await gateway.onLocation(fakeSocket(asDriver()), loc);
      expect(tracking.recordDriverLocation).toHaveBeenCalled();
      expect(emitted).toEqual([]);
      expect(tracking.saveTrackingPoint).not.toHaveBeenCalled();
    });
  });

  // ── message ─────────────────────────────────────────────────────────

  describe('message', () => {
    it("impose l'expéditeur côté serveur", async () => {
      tracking.findAccessibleTrip.mockResolvedValue(TRIP);

      await gateway.onMessage(fakeSocket(asPassenger()), { tripId: TRIP_ID, text: 'Je suis devant la gare' });

      expect(emitted[0]).toMatchObject({
        room: `trip:${TRIP_ID}`,
        event: 'message',
        data: { from: { id: 'passenger-1', role: 'passenger' }, text: 'Je suis devant la gare' },
      });
    });

    it('refuse un non-participant et applique la limite de débit', async () => {
      tracking.findAccessibleTrip.mockResolvedValueOnce(null);
      await expect(
        gateway.onMessage(fakeSocket(asPassenger()), { tripId: TRIP_ID, text: 'x' }),
      ).rejects.toThrow(WsException);

      tracking.findAccessibleTrip.mockResolvedValueOnce(TRIP);
      tracking.allowMessage.mockResolvedValueOnce(false);
      await expect(
        gateway.onMessage(fakeSocket(asPassenger()), { tripId: TRIP_ID, text: 'x' }),
      ).rejects.toThrow('Trop de messages');
      expect(emitted).toEqual([]);
    });
  });

  // ── sos ─────────────────────────────────────────────────────────────

  describe('sos', () => {
    const sos = { tripId: TRIP_ID, lat: 48.85, lng: 2.35 };

    it("alerte les admins uniquement (jamais la salle du trajet) et met en file avec l'userId", async () => {
      tracking.findAccessibleTrip.mockResolvedValue(TRIP);

      const res = await gateway.onSos(fakeSocket(asPassenger()), sos);

      expect(res).toEqual({ received: true });
      expect(emitted).toHaveLength(1);
      expect(emitted[0].room).toBe(ADMIN_ROOM);
      expect(emitted[0].event).toBe('sos');
      expect(emitted[0].data.alert).toMatchObject({
        tripId: TRIP_ID,
        userId: 'passenger-1',
        position: { lat: 48.85, lng: 2.35 },
        incidentId: 'incident-1', // incident persisté, suivi dans le dashboard admin
      });
      expect(tracking.queueSos).toHaveBeenCalledWith(expect.objectContaining({ userId: 'passenger-1' }));
    });

    it('accepte un SOS sur une course terminée mais pas pour un non-participant', async () => {
      tracking.findAccessibleTrip.mockResolvedValue(null);
      await expect(gateway.onSos(fakeSocket(asPassenger()), sos)).rejects.toThrow(WsException);
      expect(tracking.findAccessibleTrip).toHaveBeenCalledWith(expect.anything(), TRIP_ID, { allowTerminal: true });
      expect(tracking.queueSos).not.toHaveBeenCalled();
    });

    it("n'inonde pas les admins en cas de SOS répétés", async () => {
      tracking.findAccessibleTrip.mockResolvedValue(TRIP);
      tracking.allowSos.mockResolvedValue(false);

      expect(await gateway.onSos(fakeSocket(asPassenger()), sos)).toEqual({ received: true });
      expect(emitted).toEqual([]);
      expect(tracking.queueSos).not.toHaveBeenCalled();
    });
  });

  it('emitTripStatus émet "status" dans la salle du trajet', () => {
    gateway.emitTripStatus(TRIP_ID, 'started');
    expect(emitted[0]).toMatchObject({ room: `trip:${TRIP_ID}`, event: 'status', data: { status: 'started' } });
  });
});

// ── CORS ──────────────────────────────────────────────────────────────

describe('isOriginAllowed', () => {
  const allow = ['https://corporate.xlcab.com'];

  it('accepte les origines de la liste blanche et les apps natives (sans Origin)', () => {
    expect(isOriginAllowed('https://corporate.xlcab.com', allow)).toBe(true);
    expect(isOriginAllowed(undefined, allow)).toBe(true);
  });

  it('refuse toute autre origine navigateur', () => {
    expect(isOriginAllowed('https://evil.example', allow)).toBe(false);
    expect(isOriginAllowed('https://evil.example', [])).toBe(false);
  });
});

// ── Validation des messages entrants ──────────────────────────────────

describe('DTOs WebSocket', () => {
  const opts = { whitelist: true, forbidNonWhitelisted: true };
  const errorsOf = async (cls: any, plain: object) =>
    validate(plainToInstance(cls, plain), opts);

  it('subscribe:trip exige un UUID', async () => {
    expect(await errorsOf(TripRefDto, { tripId: TRIP_ID })).toHaveLength(0);
    expect(await errorsOf(TripRefDto, { tripId: '1 OR 1=1' })).not.toHaveLength(0);
  });

  it('driver:location rejette coordonnées hors bornes, chaînes et driverId injecté', async () => {
    expect(await errorsOf(DriverLocationDto, { lat: 48.85, lng: 2.35 })).toHaveLength(0);
    expect(await errorsOf(DriverLocationDto, { lat: 200, lng: 2.35 })).not.toHaveLength(0);
    expect(await errorsOf(DriverLocationDto, { lat: '48.85', lng: 2.35 })).not.toHaveLength(0);
    expect(await errorsOf(DriverLocationDto, { lat: 48.85, lng: 2.35, driverId: 'autre' })).not.toHaveLength(0);
  });

  it('message rejette un texte vide ou de plus de 500 caractères', async () => {
    expect(await errorsOf(ChatMessageDto, { tripId: TRIP_ID, text: '   ' })).not.toHaveLength(0);
    expect(await errorsOf(ChatMessageDto, { tripId: TRIP_ID, text: 'a'.repeat(501) })).not.toHaveLength(0);
  });

  it('sos exige tripId + position valides', async () => {
    expect(await errorsOf(SosDto, { tripId: TRIP_ID, lat: 48.85, lng: 2.35 })).toHaveLength(0);
    expect(await errorsOf(SosDto, { tripId: TRIP_ID })).not.toHaveLength(0);
  });
});
