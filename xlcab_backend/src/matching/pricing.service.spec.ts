import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PricingService } from './pricing.service';

// Configuration France (Partie 11), telle que posée par prisma/seed.ts.
const FR = {
  code: 'FR',
  minTripKm: 60,
  vatPassengerRate: new Prisma.Decimal(0),
  vatParcelRate: new Prisma.Decimal(20),
  currency: 'EUR',
};

describe('PricingService', () => {
  let service: PricingService;
  let findUnique: jest.Mock;

  beforeEach(() => {
    findUnique = jest.fn(async ({ where }) => (where.code === 'FR' ? FR : null));
    service = new PricingService({ jurisdictionConfig: { findUnique }, tariff: { findFirst: jest.fn(async () => null) } } as any);
  });

  const base = { distanceKm: 100, shuttleType: 'bleue' as const, jurisdiction: 'FR' };

  it('trajet passager : tarif au km, TVA 0 % en France', async () => {
    const quote = await service.estimate({ ...base, type: 'passenger' });
    expect(quote).toEqual({
      priceCents: 9000, // 100 km × 90 c
      vatCents: 0,
      totalCents: 9000,
      currency: 'EUR',
      vatLines: [{ regime: 'passenger', baseCents: 9000, ratePercent: 0, vatCents: 0 }],
    });
  });

  it('ajoute les options : sièges enfants, Wi-Fi, bagage supplémentaire', async () => {
    const quote = await service.estimate({
      ...base,
      shuttleType: 'rose',
      type: 'passenger',
      options: { childSeats: 2, wifi: true, extraLuggage: true },
    });
    // 100 × 120 + 2 × 500 + 300 + 500
    expect(quote.priceCents).toBe(13800);
  });

  it("trajet mixte : la TVA 20 % ne s'applique qu'à la part colis (Partie 11.4)", async () => {
    const quote = await service.estimate({ ...base, type: 'mixed' });

    expect(quote.vatLines).toEqual([
      { regime: 'passenger', baseCents: 9000, ratePercent: 0, vatCents: 0 },
      { regime: 'parcel', baseCents: 800, ratePercent: 20, vatCents: 160 },
    ]);
    // Le code de départ aurait taxé les 9 800 c à 20 % : 1 960 c de TVA.
    expect(quote.vatCents).toBe(160);
    expect(quote.totalCents).toBe(9960);
  });

  it('colis seul : tout le trajet relève du transport de marchandises (20 %)', async () => {
    const quote = await service.estimate({ ...base, type: 'parcel' });
    expect(quote.vatLines).toEqual([
      { regime: 'parcel', baseCents: 9800, ratePercent: 20, vatCents: 1960 },
    ]);
    expect(quote.totalCents).toBe(11760);
  });

  it('refuse une distance inférieure au minimum de la juridiction (60 km en FR)', async () => {
    await expect(
      service.estimate({ ...base, distanceKm: 59.9, type: 'passenger' }),
    ).rejects.toThrow('Distance minimale : 60 km');
  });

  it('refuse une distance invalide', async () => {
    for (const distanceKm of [0, -10, NaN, Infinity]) {
      await expect(
        service.estimate({ ...base, distanceKm, type: 'passenger' }),
      ).rejects.toThrow(BadRequestException);
    }
  });

  it('refuse une juridiction inconnue au lieu de planter', async () => {
    await expect(
      service.estimate({ ...base, jurisdiction: 'XX', type: 'passenger' }),
    ).rejects.toThrow('Juridiction non prise en charge');
  });
});
