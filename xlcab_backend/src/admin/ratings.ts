import { Body, Controller, Delete, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { recomputeDriverRating } from '../feedback/driver-rating';
import { PrismaService } from '../prisma/prisma.service';
import { TwoFactorGuard } from '../two-factor/two-factor.guard';
import { PageQueryDto } from './dto/admin.dto';

const PAGE_SIZE = 25;
const page = (p?: number) => ({ skip: ((p ?? 1) - 1) * PAGE_SIZE, take: PAGE_SIZE });
/** Note « basse » : signal à surveiller dans le résumé par chauffeur. */
export const LOW_RATING = 2;

export class RatingsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'Chauffeur invalide' })
  driverId?: string;

  /** Notes inférieures ou égales à ce nombre d'étoiles (ex. 2 = notes basses). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  maxStars?: number;

  /** Seulement les notes avec un commentaire. */
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  withComment?: boolean;
}

export class RemoveRatingDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(10, { message: 'Motif du retrait : 10 caractères minimum' })
  @MaxLength(500)
  reason!: string;
}

const fullName = (u?: { firstName: string | null; lastName: string | null; email: string } | null) =>
  u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email : null;

/**
 * Notes des passagers vues par l'équipe XLCAB (Module 10) : commentaires
 * (jamais montrés au chauffeur), notes basses, chauffeurs à surveiller, et
 * retrait d'une note abusive (motif obligatoire, tracé, moyenne recalculée).
 */
@Injectable()
export class AdminRatingsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private async names(ids: string[]) {
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    return new Map(users.map((u) => [u.id, u]));
  }

  async list(q: RatingsQueryDto) {
    const where = {
      ...(q.driverId ? { driverId: q.driverId } : {}),
      ...(q.maxStars ? { stars: { lte: q.maxStars } } : {}),
      ...(q.withComment ? { comment: { not: null } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.tripRating.findMany({ where, orderBy: { createdAt: 'desc' }, ...page(q.page) }),
      this.prisma.tripRating.count({ where }),
    ]);
    const users = await this.names(rows.flatMap((r) => [r.driverId, r.passengerId]));
    return {
      items: rows.map((r) => ({
        id: r.id,
        tripId: r.tripId,
        stars: r.stars,
        comment: r.comment,
        createdAt: r.createdAt,
        driver: { id: r.driverId, name: fullName(users.get(r.driverId)) },
        passenger: { id: r.passengerId, name: fullName(users.get(r.passengerId)) },
      })),
      total,
      page: q.page ?? 1,
      pageSize: PAGE_SIZE,
    };
  }

  /** Chauffeurs notés, de la plus basse moyenne à la plus haute. */
  async drivers(q: PageQueryDto) {
    const where = { ratingCount: { gt: 0 } };
    const [profiles, total] = await Promise.all([
      this.prisma.driverProfile.findMany({ where, orderBy: { rating: 'asc' }, select: { id: true, rating: true, ratingCount: true, totalTrips: true }, ...page(q.page) }),
      this.prisma.driverProfile.count({ where }),
    ]);
    const ids = profiles.map((p) => p.id);
    const [users, low] = await Promise.all([
      this.names(ids),
      this.prisma.tripRating.findMany({ where: { driverId: { in: ids }, stars: { lte: LOW_RATING } }, select: { driverId: true } }),
    ]);
    const lowCount = new Map<string, number>();
    for (const l of low) lowCount.set(l.driverId, (lowCount.get(l.driverId) ?? 0) + 1);
    return {
      items: profiles.map((p) => ({
        driverId: p.id,
        name: fullName(users.get(p.id)),
        rating: Number(p.rating),
        ratingCount: p.ratingCount,
        totalTrips: p.totalTrips,
        lowCount: lowCount.get(p.id) ?? 0,
      })),
      total,
      page: q.page ?? 1,
      pageSize: PAGE_SIZE,
    };
  }

  async remove(id: string, reason: string, ctx: { adminId: string; ipAddress?: string; userAgent?: string }) {
    const rating = await this.prisma.tripRating.findUnique({ where: { id } });
    if (!rating) throw new NotFoundException('Note introuvable');
    await this.prisma.tripRating.deleteMany({ where: { id } });
    const updated = await recomputeDriverRating(this.prisma, rating.driverId);
    await this.audit.log({
      userId: ctx.adminId,
      action: 'rating.remove',
      entity: 'TripRating',
      entityId: id,
      // Le commentaire n'est pas recopié dans le journal : seulement ce qui justifie la décision.
      metadata: { tripId: rating.tripId, driverId: rating.driverId, stars: rating.stars, reason },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    return { removed: true, driver: updated };
  }
}

@Controller('api/v1/admin/ratings')
@UseGuards(JwtAuthGuard, RolesGuard, TwoFactorGuard)
@Roles('admin')
export class AdminRatingsController {
  constructor(private ratings: AdminRatingsService) {}

  @Get()
  list(@Query() q: RatingsQueryDto) {
    return this.ratings.list(q);
  }

  @Get('drivers')
  drivers(@Query() q: PageQueryDto) {
    return this.ratings.drivers(q);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RemoveRatingDto) {
    return this.ratings.remove(id, dto.reason, { adminId: req.user.sub, ...AuditService.context(req) });
  }
}
