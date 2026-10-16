import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MeetingPoint } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { haversineKm } from '../parcels/parcels.constants';
import { PrismaService } from '../prisma/prisma.service';
import { TwoFactorGuard } from '../two-factor/two-factor.guard';
import { TwoFactorModule } from '../two-factor/two-factor.module';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const optionalText = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);

// ── DTO ───────────────────────────────────────────────────────────────

export class MeetingPointDto {
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Ville invalide' })
  @MaxLength(80, { message: 'Ville limitée à 80 caractères' })
  city!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Nom du point de rencontre invalide' })
  @MaxLength(80, { message: 'Nom limité à 80 caractères' })
  name!: string;

  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Adresse invalide' })
  @MaxLength(300)
  address!: string;

  @IsLatitude({ message: 'Latitude invalide' })
  lat!: number;

  @IsLongitude({ message: 'Longitude invalide' })
  lng!: number;

  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(500, { message: 'Consignes limitées à 500 caractères' })
  instructions?: string | null;

  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(200, { message: 'Transports limités à 200 caractères' })
  transit?: string | null;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/, { message: 'Pays invalide (code à 2 lettres)' })
  jurisdiction?: string;
}

export class UpdateMeetingPointDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Nom du point de rencontre invalide' })
  @MaxLength(80, { message: 'Nom limité à 80 caractères' })
  name?: string;

  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(500, { message: 'Consignes limitées à 500 caractères' })
  instructions?: string | null;

  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(200, { message: 'Transports limités à 200 caractères' })
  transit?: string | null;

  /** Retiré du catalogue : plus proposé pour de nouveaux arrêts (les arrêts existants restent). */
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class MeetingPointsQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  city?: string;

  /** Autour d'une position (avec radiusKm) : points proches d'un trajet. */
  @IsOptional()
  @Type(() => Number)
  @IsLatitude({ message: 'Latitude invalide' })
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude({ message: 'Longitude invalide' })
  lng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'Rayon invalide' })
  @Max(500, { message: 'Rayon invalide' })
  radiusKm?: number;
}

export const meetingPointView = (p: MeetingPoint) => ({
  id: p.id,
  city: p.city,
  name: p.name,
  address: p.address,
  lat: p.lat,
  lng: p.lng,
  instructions: p.instructions ?? null,
  transit: p.transit ?? null,
  jurisdiction: p.jurisdiction,
  active: p.active,
});

// ── Service ───────────────────────────────────────────────────────────

/**
 * Catalogue des points de rencontre (CLARIFICATION_MODELE.md, section 5.3,
 * décision D8) : tenu par l'équipe XLCAB, rattaché à une ville, choisi pour
 * être sûr et autorisé à l'arrêt selon la réglementation locale. Les
 * chauffeurs y choisissent les arrêts de leurs lignes ; un point retiré n'est
 * plus proposé mais les arrêts qui l'utilisent restent valables.
 */
@Injectable()
export class MeetingPointsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /** Points actifs (chauffeurs) : par ville, ou autour d'une position. */
  async list(q: MeetingPointsQueryDto, includeInactive = false) {
    const rows = await this.prisma.meetingPoint.findMany({
      where: { ...(includeInactive ? {} : { active: true }), ...(q.city ? { city: q.city } : {}) },
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
      take: 500,
    });
    let points = rows;
    if (q.lat !== undefined && q.lng !== undefined) {
      const at = { lat: q.lat, lng: q.lng };
      const radius = q.radiusKm ?? 50;
      points = rows
        .map((p) => ({ p, km: haversineKm(at, p) }))
        .filter((x) => x.km <= radius)
        .sort((a, b) => a.km - b.km)
        .map((x) => x.p);
    }
    return points.map(meetingPointView);
  }

  async create(adminId: string, dto: MeetingPointDto, ctx: { ipAddress?: string; userAgent?: string }) {
    const clash = await this.prisma.meetingPoint.findFirst({ where: { city: dto.city, name: dto.name } });
    if (clash) throw new BadRequestException('Un point de rencontre porte déjà ce nom dans cette ville');
    const created = await this.prisma.meetingPoint.create({
      data: {
        city: dto.city, name: dto.name, address: dto.address, lat: dto.lat, lng: dto.lng,
        instructions: dto.instructions ?? null, transit: dto.transit ?? null, jurisdiction: dto.jurisdiction ?? 'FR',
      },
    });
    await this.audit.log({ userId: adminId, action: 'meeting_point.create', entity: 'MeetingPoint', entityId: created.id, ...ctx });
    return meetingPointView(created);
  }

  /** La position ne change pas (les arrêts et réservations y renvoient) : on en crée un autre. */
  async update(adminId: string, id: string, dto: UpdateMeetingPointDto, ctx: { ipAddress?: string; userAgent?: string }) {
    const point = await this.prisma.meetingPoint.findUnique({ where: { id } });
    if (!point) throw new NotFoundException('Point de rencontre introuvable');
    const data: Record<string, unknown> = {};
    for (const key of ['name', 'instructions', 'transit', 'active'] as const) {
      if (dto[key] !== undefined) data[key] = dto[key];
    }
    if (Object.keys(data).length === 0) throw new BadRequestException('Rien à modifier');
    const updated = await this.prisma.meetingPoint.update({ where: { id }, data });
    await this.audit.log({ userId: adminId, action: 'meeting_point.update', entity: 'MeetingPoint', entityId: id, metadata: { fields: Object.keys(data) }, ...ctx });
    return meetingPointView(updated);
  }
}

// ── Contrôleurs ───────────────────────────────────────────────────────

/** Catalogue consultable par tout compte connecté (chauffeurs : arrêts ; passagers : consignes). */
@Controller('api/v1/meeting-points')
@UseGuards(JwtAuthGuard)
export class MeetingPointsController {
  constructor(private points: MeetingPointsService) {}

  @Get()
  list(@Query() q: MeetingPointsQueryDto) {
    return this.points.list(q);
  }
}

@Controller('api/v1/admin/meeting-points')
@UseGuards(JwtAuthGuard, RolesGuard, TwoFactorGuard)
@Roles('admin')
export class AdminMeetingPointsController {
  constructor(private points: MeetingPointsService) {}

  @Get()
  list(@Query() q: MeetingPointsQueryDto) {
    return this.points.list(q, true);
  }

  @Post()
  create(@Req() req: any, @Body() dto: MeetingPointDto) {
    return this.points.create(req.user.sub, dto, AuditService.context(req));
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMeetingPointDto) {
    return this.points.update(req.user.sub, id, dto, AuditService.context(req));
  }
}

@Module({
  imports: [TwoFactorModule],
  controllers: [MeetingPointsController, AdminMeetingPointsController],
  providers: [MeetingPointsService],
  exports: [MeetingPointsService],
})
export class MeetingPointsModule {}
