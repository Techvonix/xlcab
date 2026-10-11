import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ShuttleType, TripType } from './matching.constants';

/** Grille tarifaire, en centimes HT. */
export interface TariffValues {
  ratesPerKm: Record<ShuttleType, number>;
  childSeatCents: number;
  wifiCents: number;
  extraLuggageCents: number;
  /** Supplément colis d'une course mixte, et colis en navette dédiée. */
  parcelFeeCents: number;
  /** Colis en navette partagée (aller avec des passagers, ou trajet retour). */
  sharedParcelCents: number;
}

/**
 * Tarifs de la Partie 10, appliqués tant qu'aucun tarif n'a été saisi
 * dans le dashboard admin pour la juridiction.
 */
export const DEFAULT_TARIFF: TariffValues = {
  ratesPerKm: { rose: 120, bleue: 90, orange: 150, accessibility: 100 },
  childSeatCents: 500,
  wifiCents: 300,
  extraLuggageCents: 500,
  parcelFeeCents: 800,
  sharedParcelCents: 800,
};

// Le tarif en vigueur est relu au plus toutes les 30 s (devis appelés à
// chaque frappe) ; vidé immédiatement quand un admin en publie un nouveau.
const TARIFF_CACHE_MS = 30_000;

export interface PriceOptions {
  childSeats?: number;
  wifi?: boolean;
  extraLuggage?: boolean;
}

export interface PriceInput {
  /**
   * Distance calculée CÔTÉ SERVEUR (itinéraire Google). Ne jamais
   * reprendre une distance envoyée par le client : il fixerait son prix.
   */
  distanceKm: number;
  shuttleType: ShuttleType;
  type: TripType;
  jurisdiction: string;
  options?: PriceOptions;
}

/** Une ligne par régime de TVA : transport de personnes / de marchandises. */
export interface VatLine {
  regime: 'passenger' | 'parcel';
  baseCents: number;
  ratePercent: number;
  vatCents: number;
}

export interface PriceQuote {
  priceCents: number; // HT
  vatCents: number;
  totalCents: number; // TTC
  currency: string;
  vatLines: VatLine[];
}

@Injectable()
export class PricingService {
  private cache = new Map<string, { at: number; values: TariffValues }>();

  constructor(private prisma: PrismaService) {}

  /** Tarif en vigueur à l'instant [at] pour la juridiction (défaut : maintenant). */
  async tariffFor(jurisdiction: string, at = new Date()): Promise<TariffValues> {
    const live = at.getTime() >= Date.now() - 1000;
    const cached = live ? this.cache.get(jurisdiction) : undefined;
    if (cached && Date.now() - cached.at < TARIFF_CACHE_MS) return cached.values;

    const row = await this.prisma.tariff.findFirst({
      where: { jurisdiction, effectiveFrom: { lte: at } },
      orderBy: { effectiveFrom: 'desc' },
    });
    const values: TariffValues = row
      ? {
          ratesPerKm: { ...DEFAULT_TARIFF.ratesPerKm, ...(row.ratesPerKm as Partial<Record<ShuttleType, number>>) },
          childSeatCents: row.childSeatCents,
          wifiCents: row.wifiCents,
          extraLuggageCents: row.extraLuggageCents,
          parcelFeeCents: row.parcelFeeCents,
          sharedParcelCents: row.sharedParcelCents,
        }
      : DEFAULT_TARIFF;
    if (live) this.cache.set(jurisdiction, { at: Date.now(), values });
    return values;
  }

  /** Appelé à la publication d'un tarif : les devis suivants l'appliquent aussitôt. */
  clearTariffCache() {
    this.cache.clear();
  }

  /**
   * Corrige deux erreurs du code de départ (Partie 10) :
   * - la TVA colis (20 %) s'appliquait à TOUT le prix dès qu'un colis
   *   était présent, part passager comprise. Or la part passager est
   *   exonérée en France (Partie 11.4, art. 261-4-4° CGI) : chaque part
   *   est désormais taxée à son propre taux, sur sa propre ligne ;
   * - une juridiction inconnue faisait planter le calcul (config null).
   * Ajoute aussi la distance minimale de la juridiction (60 km en FR).
   */
  async estimate(input: PriceInput): Promise<PriceQuote> {
    const config = await this.prisma.jurisdictionConfig.findUnique({
      where: { code: input.jurisdiction },
    });
    if (!config) {
      throw new BadRequestException('Juridiction non prise en charge');
    }

    if (!Number.isFinite(input.distanceKm) || input.distanceKm <= 0) {
      throw new BadRequestException('Distance invalide');
    }
    if (input.distanceKm < config.minTripKm) {
      throw new BadRequestException(
        `Distance minimale : ${config.minTripKm} km`,
      );
    }

    const tariff = await this.tariffFor(input.jurisdiction);
    const transportCents = Math.round(input.distanceKm * tariff.ratesPerKm[input.shuttleType]);

    // Répartition HT entre les deux régimes de TVA.
    let passengerBase = 0;
    let parcelBase = 0;
    if (input.type === 'parcel') {
      // Colis seul : tout le trajet est du transport de marchandises.
      // Les options passager (siège enfant, Wi-Fi…) n'ont pas de sens ici.
      parcelBase = transportCents + tariff.parcelFeeCents;
    } else {
      passengerBase = transportCents + this.optionsCents(tariff, input.options);
      if (input.type === 'mixed') parcelBase = tariff.parcelFeeCents;
    }

    const vatLines: VatLine[] = [];
    if (passengerBase > 0) {
      vatLines.push(this.vatLine('passenger', passengerBase, Number(config.vatPassengerRate)));
    }
    if (parcelBase > 0) {
      vatLines.push(this.vatLine('parcel', parcelBase, Number(config.vatParcelRate)));
    }

    const priceCents = passengerBase + parcelBase;
    const vatCents = vatLines.reduce((sum, l) => sum + l.vatCents, 0);
    return {
      priceCents,
      vatCents,
      totalCents: priceCents + vatCents,
      currency: config.currency,
      vatLines,
    };
  }

  /**
   * Colis en navette partagée (aller ou retour) : forfait du tarif en
   * vigueur (8 € HT par défaut), au taux marchandises.
   */
  async graftedParcel(jurisdiction: string): Promise<PriceQuote> {
    const config = await this.prisma.jurisdictionConfig.findUnique({ where: { code: jurisdiction } });
    if (!config) throw new BadRequestException('Juridiction non prise en charge');
    const fee = (await this.tariffFor(jurisdiction)).sharedParcelCents;
    const line = this.vatLine('parcel', fee, Number(config.vatParcelRate));
    return {
      priceCents: fee,
      vatCents: line.vatCents,
      totalCents: fee + line.vatCents,
      currency: config.currency,
      vatLines: [line],
    };
  }

  private optionsCents(tariff: TariffValues, options: PriceOptions = {}): number {
    return (
      (options.childSeats ?? 0) * tariff.childSeatCents +
      (options.wifi ? tariff.wifiCents : 0) +
      (options.extraLuggage ? tariff.extraLuggageCents : 0)
    );
  }

  private vatLine(regime: VatLine['regime'], baseCents: number, ratePercent: number): VatLine {
    return {
      regime,
      baseCents,
      ratePercent,
      vatCents: Math.round((baseCents * ratePercent) / 100),
    };
  }
}
