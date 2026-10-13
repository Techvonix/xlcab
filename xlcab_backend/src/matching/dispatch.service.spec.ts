import { ConflictException, NotFoundException } from '@nestjs/common';
import { FakeRedis, fakeTripTable } from '../testing/fake-redis';
import { Candidate } from './matching.service';
import { DispatchService, OFFER_TIMEOUT_MS } from './dispatch.service';

const TRIP_ID = '33333333-3333-4333-8333-333333333333';
const owner = { sub: 'passenger-a', role: 'passenger' };

describe('DispatchService', () => {
  let service: DispatchService;
  let redis: FakeRedis;
  let trips: Record<string, any>;
  let matching: { findEligibleDrivers: jest.Mock; busyDrivers: jest.Mock; transferReturnParcels: jest.Mock };
  let tracking: { emitToDriver: jest.Mock; emitTripStatus: jest.Mock };

  const candidate = (driverId: string, distanceKm = 1): Candidate => ({
    driverId,
    vehicleId: `v-${driverId}`,
    distanceKm,
  });

  /** Chauffeurs en ligne (vus récemment) et libres. */
  const online = (...ids: string[]) => ids.forEach((id) => redis.store.set(`driver:seen:${id}`, '1'));

  /** Offres reçues par un chauffeur. */
  const offersTo = (driverId: string) =>
    tracking.emitToDriver.mock.calls.filter(([d, event]) => d === driverId && event === 'mission:offer');

  beforeEach(() => {
    jest.useFakeTimers();
    redis = new FakeRedis();
    trips = {
      [TRIP_ID]: {
        id: TRIP_ID,
        passengerId: 'passenger-a',
        status: 'pending',
        type: 'passenger',
        shuttleType: 'bleue',
        jurisdiction: 'FR',
        originLat: 48.85,
        originLng: 2.35,
        destinationLat: 49.44,
        destinationLng: 1.09,
        originAddress: 'Gare de Lyon, Paris',
        destinationAddress: 'Gare de Rouen',
        distanceKm: 135,
        scheduledAt: null,
        totalPriceCents: 12150,
        passengerBooking: { seats: 3 },
      },
    };
    matching = {
      findEligibleDrivers: jest.fn().mockResolvedValue([candidate('d1'), candidate('d2', 3)]),
      busyDrivers: jest.fn().mockResolvedValue(new Set()),
      transferReturnParcels: jest.fn().mockResolvedValue(0),
    };
    tracking = { emitToDriver: jest.fn(), emitTripStatus: jest.fn() };
    online('d1', 'd2');

    service = new DispatchService(
      { trip: fakeTripTable(trips) } as any,
      redis as any,
      matching as any,
      tracking as any,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  // ── Lancement ───────────────────────────────────────────────────────

  describe('startMatching', () => {
    it("refuse un utilisateur qui n'est pas le passager (même réponse qu'un trajet inexistant)", async () => {
      await expect(
        service.startMatching({ sub: 'passenger-b', role: 'passenger' }, TRIP_ID),
      ).rejects.toThrow(NotFoundException);
      await expect(service.startMatching(owner, 'inexistant')).rejects.toThrow(NotFoundException);
      expect(matching.findEligibleDrivers).not.toHaveBeenCalled();
    });

    it('autorise un admin à lancer la recherche', async () => {
      const res = await service.startMatching({ sub: 'admin-1', role: 'admin' }, TRIP_ID);
      expect(res.status).toBe('searching');
    });

    it('relit tous les critères en base (position, navette, places)', async () => {
      await service.startMatching(owner, TRIP_ID);
      expect(matching.findEligibleDrivers).toHaveBeenCalledWith({
        // Sans préférence « conductrice » enregistrée : ordre de proximité simple.
        preferRose: false,
        lat: 48.85, lng: 2.35, shuttleType: 'bleue', jurisdiction: 'FR', seats: 3, scheduledAt: null,
        durationMin: undefined, destination: { lat: 49.44, lng: 1.09 },
      });
    });

    it('propose la course au plus proche uniquement, avec 30 s pour répondre', async () => {
      const res = await service.startMatching(owner, TRIP_ID);

      expect(res).toEqual({ tripId: TRIP_ID, status: 'searching' });
      expect(trips[TRIP_ID].status).toBe('searching');
      expect(offersTo('d1')).toHaveLength(1);
      expect(offersTo('d2')).toHaveLength(0);
      expect(offersTo('d1')[0][2]).toMatchObject({
        tripId: TRIP_ID,
        originAddress: 'Gare de Lyon, Paris',
        seats: 3,
        totalPriceCents: 12150,
        expiresAt: Date.now() + OFFER_TIMEOUT_MS,
      });
      // Aucune donnée d'identité du passager dans l'offre.
      expect(offersTo('d1')[0][2]).not.toHaveProperty('passengerId');
    });

    it('refuse de lancer une deuxième recherche en parallèle', async () => {
      await service.startMatching(owner, TRIP_ID);
      await expect(service.startMatching(owner, TRIP_ID)).rejects.toThrow(ConflictException);
    });

    it('passe en no_driver sans candidat, et le signale aux abonnés', async () => {
      matching.findEligibleDrivers.mockResolvedValue([]);
      const res = await service.startMatching(owner, TRIP_ID);

      expect(res.status).toBe('no_driver');
      expect(trips[TRIP_ID].status).toBe('no_driver');
      expect(tracking.emitTripStatus).toHaveBeenCalledWith(TRIP_ID, 'no_driver');
    });

    it('permet de relancer une recherche après un no_driver', async () => {
      trips[TRIP_ID].status = 'no_driver';
      const res = await service.startMatching(owner, TRIP_ID);
      expect(res.status).toBe('searching');
    });

    it('saute un candidat déconnecté ou ayant déjà une offre', async () => {
      matching.findEligibleDrivers.mockResolvedValue([
        candidate('d-gone'), candidate('d-offered'), candidate('d1'),
      ]);
      redis.store.set('driver:seen:d-offered', '1');
      redis.store.set('driver:offer:d-offered', 'autre-trajet');

      await service.startMatching(owner, TRIP_ID);

      expect(tracking.emitToDriver.mock.calls.map(([d]) => d)).toEqual(['d1']);
    });
  });

  // ── Recherche différée (courses programmées) ────────────────────────

  describe('recherche différée', () => {
    it('course dans 5 jours : aucun chauffeur sollicité maintenant, recherche prévue à T − 3 h', async () => {
      const departure = new Date(Date.now() + 5 * 86400_000);
      trips[TRIP_ID].scheduledAt = departure;

      const res = await service.startMatching(owner, TRIP_ID);

      expect(res).toEqual({ tripId: TRIP_ID, status: 'pending', dispatchAt: new Date(departure.getTime() - 3 * 3600_000) });
      expect(matching.findEligibleDrivers).not.toHaveBeenCalled();
      expect(tracking.emitToDriver).not.toHaveBeenCalled();
      expect(trips[TRIP_ID].status).toBe('pending');
    });

    it('relance manuelle d’un no_driver lointain : repasse en pending (attente du créneau)', async () => {
      Object.assign(trips[TRIP_ID], { status: 'no_driver', scheduledAt: new Date(Date.now() + 2 * 86400_000) });
      const res = await service.startMatching(owner, TRIP_ID);
      expect(res.status).toBe('pending');
      expect(trips[TRIP_ID].status).toBe('pending');
      expect(tracking.emitTripStatus).toHaveBeenCalledWith(TRIP_ID, 'pending');
    });

    it('délai réglable par DISPATCH_LEAD_MIN', async () => {
      process.env.DISPATCH_LEAD_MIN = '600'; // 10 h
      try {
        trips[TRIP_ID].scheduledAt = new Date(Date.now() + 8 * 3600_000);
        expect((await service.startMatching(owner, TRIP_ID)).status).toBe('searching');
      } finally {
        delete process.env.DISPATCH_LEAD_MIN;
      }
    });

    it('chaque tentative bloque la relance automatique pendant 10 min', async () => {
      await service.startMatching(owner, TRIP_ID);
      expect(redis.store.get(`dispatch:retry:${TRIP_ID}`)).toBe('1');
    });
  });

  // ── Mode chauffeur ──────────────────────────────────────────────────

  describe('offre en cours (reprise par l’app)', () => {
    it('le chauffeur sollicité retrouve son offre ; un autre chauffeur, rien', async () => {
      await service.startMatching(owner, TRIP_ID);
      expect(await service.currentOffer('d1')).toMatchObject({ tripId: TRIP_ID, seats: 3 });
      expect(await service.currentOffer('d2')).toBeNull();
    });

    it('plus d’offre après acceptation', async () => {
      await service.startMatching(owner, TRIP_ID);
      await service.accept('d1', TRIP_ID);
      expect(await service.currentOffer('d1')).toBeNull();
    });

    it('passage hors ligne : l’offre part aussitôt au chauffeur suivant', async () => {
      await service.startMatching(owner, TRIP_ID);
      await service.releaseOffersOf('d1');
      expect(offersTo('d2')).toHaveLength(1);
      expect(await service.currentOffer('d1')).toBeNull();
      expect(await service.currentOffer('d2')).toMatchObject({ tripId: TRIP_ID });
    });
  });

  // ── Expiration / refus ──────────────────────────────────────────────

  describe('expiration et refus', () => {
    it('après 30 s sans réponse, passe au chauffeur suivant (auto-refus)', async () => {
      await service.startMatching(owner, TRIP_ID);

      await jest.advanceTimersByTimeAsync(OFFER_TIMEOUT_MS - 1);
      expect(offersTo('d2')).toHaveLength(0);

      await jest.advanceTimersByTimeAsync(1);
      expect(tracking.emitToDriver).toHaveBeenCalledWith('d1', 'mission:expired', { tripId: TRIP_ID });
      expect(offersTo('d2')).toHaveLength(1);
      expect(redis.store.has('driver:offer:d1')).toBe(false);
    });

    it('un refus passe immédiatement au suivant', async () => {
      await service.startMatching(owner, TRIP_ID);
      await service.refuse('d1', TRIP_ID);
      expect(offersTo('d2')).toHaveLength(1);
    });

    it('passe en no_driver quand tous les candidats ont refusé ou expiré', async () => {
      await service.startMatching(owner, TRIP_ID);
      await service.refuse('d1', TRIP_ID);
      await jest.advanceTimersByTimeAsync(OFFER_TIMEOUT_MS);

      expect(trips[TRIP_ID].status).toBe('no_driver');
      expect(tracking.emitTripStatus).toHaveBeenCalledWith(TRIP_ID, 'no_driver');
    });

    it("un chauffeur ne peut pas refuser une offre qui ne lui a pas été faite", async () => {
      await service.startMatching(owner, TRIP_ID);
      await expect(service.refuse('d2', TRIP_ID)).rejects.toThrow(ConflictException);
      expect(offersTo('d2')).toHaveLength(0);
    });
  });

  // ── Acceptation ─────────────────────────────────────────────────────

  describe('accept', () => {
    it('attribue la course, active le suivi (driver:trip) et prévient les abonnés', async () => {
      await service.startMatching(owner, TRIP_ID);
      const res = await service.accept('d1', TRIP_ID);

      expect(res).toEqual({ tripId: TRIP_ID, status: 'accepted', vehicleId: 'v-d1' });
      expect(trips[TRIP_ID]).toMatchObject({
        status: 'accepted', driverId: 'd1', vehicleId: 'v-d1', acceptedAt: expect.any(Date),
      });
      expect(redis.store.get('driver:trip:d1')).toBe(TRIP_ID); // contrat Module 3
      expect(tracking.emitTripStatus).toHaveBeenCalledWith(TRIP_ID, 'accepted');

      // Le timer est annulé : rien ne se passe 30 s plus tard.
      await jest.advanceTimersByTimeAsync(OFFER_TIMEOUT_MS);
      expect(offersTo('d2')).toHaveLength(0);
    });

    it("refuse l'acceptation par un chauffeur à qui l'offre n'a pas été faite", async () => {
      await service.startMatching(owner, TRIP_ID);
      await expect(service.accept('d2', TRIP_ID)).rejects.toThrow('Offre expirée ou inexistante');
      expect(trips[TRIP_ID].status).toBe('searching');
      expect(trips[TRIP_ID].driverId).toBeUndefined();
    });

    it("refuse l'acceptation après expiration des 30 s", async () => {
      await service.startMatching(owner, TRIP_ID);
      await jest.advanceTimersByTimeAsync(OFFER_TIMEOUT_MS);
      await expect(service.accept('d1', TRIP_ID)).rejects.toThrow(ConflictException);
    });

    it('une double acceptation ne réussit qu\'une fois', async () => {
      await service.startMatching(owner, TRIP_ID);
      const results = await Promise.allSettled([
        service.accept('d1', TRIP_ID),
        service.accept('d1', TRIP_ID),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    });

    it('refuse si la course a été annulée pendant l\'offre', async () => {
      await service.startMatching(owner, TRIP_ID);
      trips[TRIP_ID].status = 'cancelled';

      await expect(service.accept('d1', TRIP_ID)).rejects.toThrow("n'est plus disponible");
      expect(redis.store.has('driver:trip:d1')).toBe(false);
    });

    it('course programmée dans 2 h : acceptée, mais position PAS encore partagée', async () => {
      trips[TRIP_ID].scheduledAt = new Date(Date.now() + 2 * 3600_000);
      await service.startMatching(owner, TRIP_ID);
      await service.accept('d1', TRIP_ID);

      expect(trips[TRIP_ID].status).toBe('accepted');
      expect(redis.store.has('driver:trip:d1')).toBe(false); // activé à T − 60 min
    });

    it('créneau déjà pris entre-temps : refus et passage au chauffeur suivant', async () => {
      await service.startMatching(owner, TRIP_ID);
      matching.busyDrivers.mockResolvedValueOnce(new Set(['d1']));

      await expect(service.accept('d1', TRIP_ID)).rejects.toThrow('Vous avez déjà une course sur ce créneau');
      expect(trips[TRIP_ID].status).toBe('searching');
      expect(offersTo('d2')).toHaveLength(1);
    });
  });
});
