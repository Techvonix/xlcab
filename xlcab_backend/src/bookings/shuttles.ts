import { Controller, Get, Injectable, Logger, NotFoundException, Query, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SHUTTLE_TYPES, type ShuttleType } from '../matching/matching.constants';
import { MatchingService } from '../matching/matching.service';
import { PricingService } from '../matching/pricing.service';
import { PrismaService } from '../prisma/prisma.service';

export class ShuttlesQueryDto {
  /** Position du passager (facultative) : sans elle, la disponibilité reste inconnue. */
  @IsOptional()
  @Type(() => Number)
  @IsLatitude({ message: 'Latitude invalide' })
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude({ message: 'Longitude invalide' })
  lng?: number;
}

export interface ShuttleOffer {
  type: ShuttleType;
  /** Un chauffeur de ce type est en ligne à proximité ; null = inconnu (pas de position). */
  available: boolean | null;
  /** Prix TTC du trajet le plus court autorisé (distance minimale), 1 passager, sans option. */
  fromCents: number;
}

/**
 * Écran 5 (sélection de la navette) : pour chaque navette, disponibilité
 * actuelle et prix « à partir de ». Ne révèle ni le nombre ni la position
 * des chauffeurs : seulement oui / non.
 */
@Injectable()
export class ShuttlesService {
  private readonly logger = new Logger(ShuttlesService.name);

  constructor(
    private prisma: PrismaService,
    private matching: MatchingService,
    private pricing: PricingService,
  ) {}

  async overview(userId: string, lat?: number, lng?: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { jurisdiction: true } });
    if (!user) throw new NotFoundException('Compte introuvable');
    const jurisdiction = user.jurisdiction ?? 'FR';
    const config = await this.prisma.jurisdictionConfig.findUnique({ where: { code: jurisdiction } });
    if (!config) throw new NotFoundException('Juridiction non prise en charge');

    const hasPosition = lat !== undefined && lng !== undefined;
    const shuttles: ShuttleOffer[] = await Promise.all(
      SHUTTLE_TYPES.map(async (type) => {
        const price = await this.pricing.estimate({ distanceKm: config.minTripKm, shuttleType: type, type: 'passenger', jurisdiction });
        return { type, available: hasPosition ? await this.isAvailable(type, jurisdiction, lat!, lng!) : null, fromCents: price.totalCents };
      }),
    );
    return { jurisdiction, minTripKm: config.minTripKm, currency: config.currency, shuttles };
  }

  /** Même filtre que le dispatch (documents, dashcam, PMR, habilitation Rose). */
  private async isAvailable(type: ShuttleType, jurisdiction: string, lat: number, lng: number): Promise<boolean | null> {
    try {
      const candidates = await this.matching.findEligibleDrivers({ lat, lng, shuttleType: type, jurisdiction, seats: 1, scheduledAt: null });
      return candidates.length > 0;
    } catch (err) {
      // Redis indisponible… : on n'affirme rien plutôt que « indisponible ».
      this.logger.warn(`Disponibilité ${type} inconnue : ${(err as Error).message}`);
      return null;
    }
  }
}

@Controller('api/v1/shuttles')
@UseGuards(JwtAuthGuard)
export class ShuttlesController {
  constructor(private shuttles: ShuttlesService) {}

  @Get()
  overview(@Req() req: any, @Query() q: ShuttlesQueryDto) {
    return this.shuttles.overview(req.user.sub, q.lat, q.lng);
  }
}
