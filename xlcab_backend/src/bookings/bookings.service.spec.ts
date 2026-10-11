import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { FakeRedis } from '../testing/fake-redis';
import { BookingsService } from './bookings.service';
import { PassengerQuoteDto } from './dto/passenger-quote.dto';

const inHours = (h: number) => new Date(Date.now() + h * 3600 * 1000).toISOString();

describe('BookingsService.quotePassenger', () => {
  let service: BookingsService;
  let redis: FakeRedis;
  let prisma: { user: { findUnique: jest.Mock } };
  let routing: { drivingRoute: jest.Mock };
  let pricing: { estimate: jest.Mock };

  const dto = (over: Partial<PassengerQuoteDto> = {}): PassengerQuoteDto => ({
    origin: { lat: 48.8443, lng: 2.3744 },
    destination: { lat: 49.4488, lng: 1.0942 },
    shuttleType: 'bleue',
    scheduledAt: inHours(3),
    seats: 2,
    ...over,
  });

  beforeEach(() => {
    redis = new FakeRedis();
    prisma = { user: { findUnique: jest.fn().mockResolvedValue({ jurisdiction: 'FR', deletedAt: null }) } };
    routing = { drivingRoute: jest.fn().mockResolvedValue({ distanceKm: 135.4, durationMin: 97 }) };
    pricing = {
      estimate: jest.fn().mockResolvedValue({
        priceCents: 12186, vatCents: 0, totalCents: 12186, currency: 'EUR', vatLines: [],
      }),
    };
    service = new BookingsService(prisma as any, redis as any, routing as any, pricing as any);
  });

  it('calcule la distance côté serveur puis le prix, dans la juridiction du compte', async () => {
    const quote = await service.quotePassenger('u1', dto({ childSeats: 1, wifi: true }));

    expect(routing.drivingRoute).toHaveBeenCalledWith(
      { lat: 48.8443, lng: 2.3744 },
      { lat: 49.4488, lng: 1.0942 },
    );
    expect(pricing.estimate).toHaveBeenCalledWith({
      distanceKm: 135.4,
      shuttleType: 'bleue',
      type: 'passenger',
      jurisdiction: 'FR',
      options: { childSeats: 1, wifi: true, extraLuggage: false },
    });
    expect(quote).toMatchObject({ distanceKm: 135.4, durationMin: 97, totalCents: 12186 });
  });

  it('"toggle colis" : le trajet devient mixte (TVA colis sur la seule part colis)', async () => {
    await service.quotePassenger('u1', dto({ withParcel: true }));
    expect(pricing.estimate).toHaveBeenCalledWith(expect.objectContaining({ type: 'mixed' }));
  });

  it("refuse un départ à moins de 2 h, avant tout appel payant à Google", async () => {
    await expect(service.quotePassenger('u1', dto({ scheduledAt: inHours(1.9) }))).rejects.toThrow(
      'Réservation au moins 2 h à l’avance',
    );
    expect(routing.drivingRoute).not.toHaveBeenCalled();
  });

  it('refuse plus de sièges enfants que de passagers', async () => {
    await expect(service.quotePassenger('u1', dto({ seats: 2, childSeats: 3 }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuse un départ identique à l’arrivée', async () => {
    const same = { lat: 48.8443, lng: 2.3744 };
    await expect(service.quotePassenger('u1', dto({ destination: same }))).rejects.toThrow(BadRequestException);
  });

  it('refuse un compte supprimé', async () => {
    prisma.user.findUnique.mockResolvedValue({ jurisdiction: 'FR', deletedAt: new Date() });
    await expect(service.quotePassenger('u1', dto())).rejects.toThrow(UnauthorizedException);
  });

  it('limite à 30 devis par minute et par utilisateur (429)', async () => {
    for (let i = 0; i < 30; i++) await service.quotePassenger('u1', dto());
    await expect(service.quotePassenger('u1', dto())).rejects.toMatchObject({ status: 429 });
    // Un autre utilisateur n'est pas affecté.
    await expect(service.quotePassenger('u2', dto())).resolves.toBeDefined();
  });
});
