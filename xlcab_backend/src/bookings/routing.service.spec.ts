import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { FakeRedis } from '../testing/fake-redis';
import { RoutingService } from './routing.service';

const PARIS = { lat: 48.8443, lng: 2.3744 };
const ROUEN = { lat: 49.4488, lng: 1.0942 };

describe('RoutingService', () => {
  let redis: FakeRedis;
  let fetchMock: jest.SpyInstance;
  let apiKey: string | undefined;

  const service = () =>
    new RoutingService({ get: () => apiKey } as any, redis as any);

  const googleResponds = (status: number, body: object) =>
    fetchMock.mockResolvedValue({ ok: status < 400, status, json: async () => body } as Response);

  beforeEach(() => {
    redis = new FakeRedis();
    apiKey = 'server-key';
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => fetchMock.mockRestore());

  it('appelle Google Routes avec la clé serveur et un masque de champs', async () => {
    googleResponds(200, { routes: [{ distanceMeters: 135_420, duration: '5820s' }] });

    const route = await service().drivingRoute(PARIS, ROUEN);

    expect(route).toEqual({ distanceKm: 135.4, durationMin: 97 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    expect(init.headers['X-Goog-Api-Key']).toBe('server-key');
    expect(init.headers['X-Goog-FieldMask']).toBe('routes.distanceMeters,routes.duration');
    expect(JSON.parse(init.body).origin.location.latLng).toEqual({ latitude: 48.8443, longitude: 2.3744 });
  });

  it("met l'itinéraire en cache : pas de second appel facturé pour le même trajet", async () => {
    googleResponds(200, { routes: [{ distanceMeters: 135_420, duration: '5820s' }] });
    const s = service();

    await s.drivingRoute(PARIS, ROUEN);
    // Coordonnées différentes au-delà de la 4e décimale : même clé de cache.
    await s.drivingRoute({ lat: 48.84431, lng: 2.37441 }, ROUEN);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("répond 503 (sans détail Google) si la clé serveur n'est pas configurée", async () => {
    apiKey = undefined;
    await expect(service().drivingRoute(PARIS, ROUEN)).rejects.toThrow(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('répond 503 si Google est en erreur ou injoignable', async () => {
    googleResponds(500, {});
    await expect(service().drivingRoute(PARIS, ROUEN)).rejects.toThrow(ServiceUnavailableException);

    fetchMock.mockRejectedValue(new Error('timeout'));
    await expect(service().drivingRoute(PARIS, ROUEN)).rejects.toThrow(ServiceUnavailableException);
  });

  it("répond 400 s'il n'existe aucun itinéraire routier", async () => {
    googleResponds(200, {});
    await expect(service().drivingRoute(PARIS, ROUEN)).rejects.toThrow(BadRequestException);
  });
});
