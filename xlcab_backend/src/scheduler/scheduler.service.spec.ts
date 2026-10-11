import { ConfigService } from '@nestjs/config';
import { FakeRedis } from '../testing/fake-redis';
import { FakeStripe } from '../testing/fake-stripe';
import { memoryPrisma } from '../testing/memory-prisma';
import { DispatchService } from '../matching/dispatch.service';
import { PaymentsService } from '../payments/payments.service';
import { SchedulerService } from './scheduler.service';

// Planificateur avec les vrais services Dispatch et Payments ; base,
// Redis et Stripe simulés, matching piloté par le test.

const HOUR = 3600_000;

describe('SchedulerService', () => {
  let prisma: ReturnType<typeof memoryPrisma>;
  let redis: FakeRedis;
  let stripe: FakeStripe;
  let matching: { findEligibleDrivers: jest.Mock; busyDrivers: jest.Mock };
  let tracking: { emitToDriver: jest.Mock; emitTripStatus: jest.Mock };
  let notifications: { notify: jest.Mock };
  let dispatch: DispatchService;
  let scheduler: SchedulerService;

  const addTrip = async (data: Record<string, unknown>) =>
    prisma.trip.create({
      data: {
        type: 'passenger', shuttleType: 'bleue', jurisdiction: 'FR', passengerId: 'p1',
        originAddress: 'Paris', originLat: 48.85, originLng: 2.35,
        destinationAddress: 'Rouen', destinationLat: 49.44, destinationLng: 1.09,
        totalPriceCents: 12000, durationMin: 97, ...data,
      },
    });
  const statusOf = async (id: string) => (await prisma.trip.findUnique({ where: { id } })).status;
  /** Nouveau tour : le verrou d'une minute est levé. */
  const tick = async (now = new Date()) => {
    redis.store.delete('scheduler:tick:lock');
    return scheduler.tick(now);
  };

  beforeEach(() => {
    prisma = memoryPrisma();
    redis = new FakeRedis();
    stripe = new FakeStripe();
    matching = {
      findEligibleDrivers: jest.fn().mockResolvedValue([{ driverId: 'd1', vehicleId: 'v1', distanceKm: 2 }]),
      busyDrivers: jest.fn().mockResolvedValue(new Set()),
    };
    redis.store.set('driver:seen:d1', '1');
    tracking = { emitToDriver: jest.fn(), emitTripStatus: jest.fn() };
    notifications = { notify: jest.fn() };
    const config = new ConfigService({});
    dispatch = new DispatchService(prisma as any, redis as any, matching as any, tracking as any);
    const payments = new PaymentsService(
      prisma as any, redis as any, config, stripe as any, dispatch, notifications as any, { log: jest.fn() } as any,
    );
    scheduler = new SchedulerService(redis as any, dispatch, payments, config, { releaseStranded: jest.fn().mockResolvedValue(0) } as any);
  });

  afterEach(() => dispatch.onModuleDestroy());

  describe('recherche de chauffeur différée', () => {
    it('lance la recherche des courses entrées dans la fenêtre T − 3 h, pas les autres', async () => {
      const soon = await addTrip({ status: 'pending', scheduledAt: new Date(Date.now() + 2.5 * HOUR) });
      const later = await addTrip({ status: 'pending', scheduledAt: new Date(Date.now() + 4 * 24 * HOUR) });

      const report = await tick();

      expect(report).toMatchObject({ dispatchStarted: 1 });
      expect(await statusOf(soon.id)).toBe('searching');
      expect(await statusOf(later.id)).toBe('pending');
      expect(tracking.emitToDriver).toHaveBeenCalledWith('d1', 'mission:offer', expect.objectContaining({ tripId: soon.id }));
    });

    it('la course lointaine est lancée quand son heure arrive', async () => {
      const departure = new Date(Date.now() + 4 * 24 * HOUR);
      const trip = await addTrip({ status: 'pending', scheduledAt: departure });

      // Simulation : on avance l'horloge du planificateur et du dispatch.
      jest.useFakeTimers({ now: departure.getTime() - 3 * HOUR + 60_000, doNotFake: ['nextTick', 'setImmediate'] });
      try {
        await tick();
        expect(await statusOf(trip.id)).toBe('searching');
      } finally {
        jest.useRealTimers();
      }
    });

    it('course d’entreprise (pending, jamais lancée) : prise en charge par le planificateur', async () => {
      const trip = await addTrip({ status: 'pending', corporateId: 'corp-1', scheduledAt: new Date(Date.now() + 2 * HOUR) });
      await tick();
      expect(await statusOf(trip.id)).toBe('searching');
    });

    it('sans chauffeur : relance au plus une fois toutes les 10 min', async () => {
      matching.findEligibleDrivers.mockResolvedValue([]);
      const trip = await addTrip({ status: 'pending', scheduledAt: new Date(Date.now() + 2 * HOUR) });

      await tick();
      expect(await statusOf(trip.id)).toBe('no_driver');

      await tick(); // une minute plus tard : trop tôt
      expect(matching.findEligibleDrivers).toHaveBeenCalledTimes(1);

      redis.store.delete(`dispatch:retry:${trip.id}`); // 10 min écoulées
      matching.findEligibleDrivers.mockResolvedValue([{ driverId: 'd1', vehicleId: 'v1', distanceKm: 2 }]);
      const report = await tick();
      expect(report).toMatchObject({ dispatchRetried: 1 });
      expect(await statusOf(trip.id)).toBe('searching');
    });

    it('départ passé depuis plus de 15 min : plus de relance', async () => {
      const trip = await addTrip({ status: 'no_driver', scheduledAt: new Date(Date.now() - 20 * 60_000) });
      await tick();
      expect(matching.findEligibleDrivers).not.toHaveBeenCalled();
      expect(await statusOf(trip.id)).toBe('no_driver');
    });

    it('n’interfère pas avec une recherche en cours ni une course attribuée', async () => {
      await addTrip({ status: 'searching', scheduledAt: new Date(Date.now() + HOUR) });
      await addTrip({ status: 'accepted', driverId: 'd2', scheduledAt: new Date(Date.now() + HOUR) });
      await tick();
      expect(matching.findEligibleDrivers).not.toHaveBeenCalled();
    });
  });

  describe('réservations non payées', () => {
    const unpaid = async (minutesAgo: number) => {
      const trip = await addTrip({
        status: 'awaiting_payment', scheduledAt: new Date(Date.now() + 26 * HOUR),
        createdAt: new Date(Date.now() - minutesAgo * 60_000),
      });
      const intent = await stripe.paymentIntents.create({ amount: 12000, currency: 'eur' }, {});
      await prisma.payment.create({
        data: { tripId: trip.id, userId: 'p1', stripePaymentIntentId: intent.id, amountCents: 12000, status: 'requires_payment' },
      });
      return { trip, intent };
    };

    it('annulée au bout de 30 min, demande de paiement Stripe annulée, passager prévenu', async () => {
      const { trip, intent } = await unpaid(31);
      const report = await tick();

      expect(report).toMatchObject({ expiredBookings: 1 });
      expect(await statusOf(trip.id)).toBe('cancelled');
      expect(stripe.canceled).toEqual([intent.id]);
      expect(notifications.notify).toHaveBeenCalledWith('p1', 'booking.expired', expect.any(String), expect.stringContaining('Aucun montant'), { tripId: trip.id });
    });

    it('moins de 30 min : laissée en attente', async () => {
      const { trip } = await unpaid(10);
      await tick();
      expect(await statusOf(trip.id)).toBe('awaiting_payment');
    });

    it('payée mais webhook en retard : validée au lieu d’être annulée', async () => {
      const { trip, intent } = await unpaid(45);
      stripe.succeed(intent.id);

      await tick();

      expect(stripe.canceled).toEqual([]);
      // Départ dans 26 h : recherche différée, la course attend en "pending".
      expect(await statusOf(trip.id)).toBe('pending');
    });

    it('paiement validé par 3-D Secure en cours : on attend', async () => {
      const { trip, intent } = await unpaid(45);
      stripe.intents.get(intent.id).status = 'processing';
      await tick();
      expect(await statusOf(trip.id)).toBe('awaiting_payment');
    });
  });

  it('une seule instance exécute le tour de la minute (verrou Redis)', async () => {
    expect(await scheduler.tick()).not.toBeNull();
    expect(await scheduler.tick()).toBeNull();
  });
});
