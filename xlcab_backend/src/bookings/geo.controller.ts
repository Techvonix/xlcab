import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RoutingService } from './routing.service';

// Valeur proposée : suffisant pour saisir quelques adresses par minute.
const GEOCODE_MAX_PER_MINUTE = 30;

export class GeocodeDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  address!: string;
}

/** Utils de la Partie 6. */
@Controller('api/v1')
@UseGuards(JwtAuthGuard)
export class GeoController {
  constructor(
    private routing: RoutingService,
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  /** POST /api/v1/geocode — utilisé par le portail web (pas de SDK Places côté web). */
  @Post('geocode')
  @HttpCode(HttpStatus.OK)
  async geocode(@Req() req: any, @Body() dto: GeocodeDto) {
    const key = `geocode:rate:${req.user.sub}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 60);
    if (count > GEOCODE_MAX_PER_MINUTE) {
      throw new HttpException('Trop de recherches — patientez une minute', HttpStatus.TOO_MANY_REQUESTS);
    }

    // Recherche limitée au pays du compte (juridiction relue en base).
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { jurisdiction: true },
    });
    if (!user) throw new UnauthorizedException('Compte introuvable');
    return this.routing.geocode(dto.address, user.jurisdiction);
  }
}
