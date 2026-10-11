import { BadRequestException } from '@nestjs/common';
import { FakeRedis } from '../testing/fake-redis';
import { MatchCriteria, MatchingService } from './matching.service';

const FR = { code: 'FR', requiresVtcCard: true };

describe('MatchingService', () => {
  let service: MatchingService;
  let redis: FakeRedis;
  let prisma: {
    jurisdictionConfig: { findUnique: jest.Mock };
    driverProfile: { findMany: jest.Mock };
    vehicle: { findMany: jest.Mock };
    trip: { findMany: jest.Mock };
    parcelBooking: { findMany: jest.Mock };
  };

  const criteria = (over: Partial<MatchCriteria> = {}): MatchCriteria => ({
    lat: 48.8566,
    lng: 2.3522,
    shuttleType: 'bleue',
    jurisdiction: 'FR',
    seats: 3,
    scheduledAt: null,
    ...over,
  });

  /** Place des chauffeurs dans l'index GEO, marqués "vus" récemment. */
  function online(...drivers: [string, number][]) {
    redis.geoResult = drivers.map(([id, km]) => [id, String(km)]);
    drivers.forEach(([id]) => redis.store.set(`driver:seen:${id}`, '1'));
  }

  beforeEach(() => {
    redis = new FakeRedis();
    prisma = {
      jurisdictionConfig: { findUnique: jest.fn().mockResolvedValue(FR) },
      // Par défaut : la base valide tous les chauffeurs demandés et
      // donne à chacun un véhicule "v-{id}". Les filtres eux-mêmes sont
      // vérifiés sur les arguments passés à Prisma.
      driverProfile: {
        findMany: jest.fn(async ({ where }) => where.id.in.map((id: string) => ({ id }))),
      },
      vehicle: {
        findMany: jest.fn(async ({ where }) =>
          where.driverId.in.map((id: string) => ({ id: `v-${id}`, driverId: id })),
        ),
      },
      // Courses déjà acceptées par les chauffeurs (aucune par défaut).
      trip: { findMany: jest.fn().mockResolvedValue([]) },
      // Colis à ramener sur un trajet retour (aucun par défaut).
      parcelBooking: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new MatchingService(prisma as any, redis as any);
  });

  it('utilise GEOSEARCH (et non GEORADIUS, obsolète) autour du point de départ', async () => {
    const spy = jest.spyOn(redis, 'geosearch');
    await service.findEligibleDrivers(criteria());
    expect(spy).toHaveBeenCalledWith(
      'drivers:online', 'FROMLONLAT', 2.3522, 48.8566, 'BYRADIUS', 30, 'km',
      'ASC', 'COUNT', 200, 'WITHDIST',
    );
  });

  it('ne renvoie que des identifiants, du plus proche au plus loin', async () => {
    online(['d-near', 1.2], ['d-mid', 4], ['d-far', 12]);
    const result = await service.findEligibleDrivers(criteria());
    expect(result).toEqual([
      { driverId: 'd-near', vehicleId: 'v-d-near', distanceKm: 1.2 },
      { driverId: 'd-mid', vehicleId: 'v-d-mid', distanceKm: 4 },
      { driverId: 'd-far', vehicleId: 'v-d-far', distanceKm: 12 },
    ]);
  });

  it("écarte les chauffeurs fantômes (pas de position depuis 30 s) avant d'interroger la base", async () => {
    online(['d-ok', 1], ['d-ghost', 2]);
    redis.store.delete('driver:seen:d-ghost');

    const result = await service.findEligibleDrivers(criteria());

    expect(result.map((c) => c.driverId)).toEqual(['d-ok']);
    expect(prisma.driverProfile.findMany.mock.calls[0][0].where.id).toEqual({ in: ['d-ok'] });
  });

  describe('courses programmées : disponibilité sur le créneau', () => {
    const at = (h: number) => new Date(Date.UTC(2026, 9, 10, h, 0));

    it('écarte un chauffeur déjà engagé sur un créneau qui chevauche (marge 1 h)', async () => {
      online(['d-free', 1], ['d-busy', 2]);
      // d-busy : course de 10 h à 12 h ; demande à 12 h 30 → dans la marge.
      prisma.trip.findMany.mockResolvedValue([{ driverId: 'd-busy', scheduledAt: at(10), durationMin: 120 }]);

      const result = await service.findEligibleDrivers(criteria({ scheduledAt: new Date(Date.UTC(2026, 9, 10, 12, 30)), durationMin: 90 }));

      expect(result.map((c) => c.driverId)).toEqual(['d-free']);
      expect(prisma.trip.findMany.mock.calls[0][0].where.status).toEqual({ in: ['accepted', 'started'] });
    });

    it('garde un chauffeur engagé un autre jour (une course jeudi ne bloque pas aujourd’hui)', async () => {
      online(['d1', 1]);
      prisma.trip.findMany.mockResolvedValue([{ driverId: 'd1', scheduledAt: at(10), durationMin: 120 }]);
      const result = await service.findEligibleDrivers(criteria({ scheduledAt: at(15), durationMin: 60 }));
      expect(result.map((c) => c.driverId)).toEqual(['d1']);
    });
  });

  it("n'interroge pas la base si aucun chauffeur n'est à proximité", async () => {
    expect(await service.findEligibleDrivers(criteria())).toEqual([]);
    expect(prisma.driverProfile.findMany).not.toHaveBeenCalled();
  });

  it('exige chauffeur validé, en ligne, permis et carte VTC valides (Partie 8)', async () => {
    online(['d1', 1]);
    await service.findEligibleDrivers(criteria());

    const where = prisma.driverProfile.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      approvedAt: { not: null },
      documentsVerified: true,
      isOnline: true,
      licenseExpiry: { gt: expect.any(Date) },
      vtcCardExpiry: { gt: expect.any(Date) },
    });
  });

  it("n'exige pas la carte VTC si la juridiction ne l'impose pas", async () => {
    prisma.jurisdictionConfig.findUnique.mockResolvedValue({ code: 'IE', requiresVtcCard: false });
    online(['d1', 1]);
    await service.findEligibleDrivers(criteria({ jurisdiction: 'IE' }));
    expect(prisma.driverProfile.findMany.mock.calls[0][0].where).not.toHaveProperty('vtcCardExpiry');
  });

  it('exige un véhicule du bon type, avec dashcam, assez de places et documents à jour', async () => {
    online(['d1', 1]);
    await service.findEligibleDrivers(criteria({ seats: 5 }));

    const where = prisma.vehicle.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      shuttleType: 'bleue', // type réel du véhicule, pas preferredShuttle
      jurisdiction: 'FR',
      isAvailable: true,
      dashcamActive: true,
      capacity: { gte: 5 },
      insuranceExpiry: { gt: expect.any(Date) },
      technicalControlExpiry: { gt: expect.any(Date) },
    });
  });

  it('Navette Rose : seulement les conductrices habilitées (roseEligible)', async () => {
    online(['d1', 1]);
    await service.findEligibleDrivers(criteria({ shuttleType: 'rose' }));
    expect(prisma.driverProfile.findMany.mock.calls[0][0].where.roseEligible).toBe(true);

    prisma.driverProfile.findMany.mockClear();
    await service.findEligibleDrivers(criteria({ shuttleType: 'bleue' }));
    expect(prisma.driverProfile.findMany.mock.calls[0][0].where).not.toHaveProperty('roseEligible');
  });

  it('Navette Accessibilité : chauffeur formé PMR et véhicule équipé', async () => {
    online(['d1', 1]);
    await service.findEligibleDrivers(criteria({ shuttleType: 'accessibility' }));
    expect(prisma.driverProfile.findMany.mock.calls[0][0].where.pmrTrained).toBe(true);
    expect(prisma.vehicle.findMany.mock.calls[0][0].where.pmrEquipped).toBe(true);
  });

  it('vérifie la validité des documents à la date de la course si elle est future', async () => {
    online(['d1', 1]);
    const scheduledAt = new Date(Date.now() + 3 * 24 * 3600 * 1000);
    await service.findEligibleDrivers(criteria({ scheduledAt }));
    expect(prisma.driverProfile.findMany.mock.calls[0][0].where.licenseExpiry).toEqual({ gt: scheduledAt });
    expect(prisma.vehicle.findMany.mock.calls[0][0].where.insuranceExpiry).toEqual({ gt: scheduledAt });
  });

  it('écarte un chauffeur sans véhicule adapté et plafonne à 10 candidats', async () => {
    const drivers: [string, number][] = Array.from({ length: 15 }, (_, i) => [`d${i}`, i]);
    online(...drivers);
    prisma.vehicle.findMany.mockImplementation(async ({ where }) =>
      where.driverId.in
        .filter((id: string) => id !== 'd0') // d0 : aucun véhicule conforme
        .map((id: string) => ({ id: `v-${id}`, driverId: id })),
    );

    const result = await service.findEligibleDrivers(criteria());

    expect(result).toHaveLength(10);
    expect(result[0].driverId).toBe('d1');
  });

  it('refuse une juridiction inconnue', async () => {
    prisma.jurisdictionConfig.findUnique.mockResolvedValue(null);
    await expect(service.findEligibleDrivers(criteria())).rejects.toThrow(BadRequestException);
  });
});
