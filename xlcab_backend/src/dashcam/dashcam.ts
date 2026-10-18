import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TwoFactorGuard } from '../two-factor/two-factor.guard';
import { TwoFactorModule } from '../two-factor/two-factor.module';

// Caméra embarquée, niveau 2 (CHARTE_CAMERA_EMBARQUEE.md, décision D11) :
// l'enregistrement reste dans la caméra du véhicule ; XLCAB ne reçoit aucune
// image en continu. Le chauffeur accepte la charte (par version) avant de
// passer en ligne ou de démarrer un trajet ; après un incident, l'équipe lui
// demande de conserver l'enregistrement du trajet et il confirme.

export const DEFAULT_DASHCAM_CHARTER_VERSION = '2026-10-18';
export const dashcamCharterVersion = () => process.env.DASHCAM_CHARTER_VERSION || DEFAULT_DASHCAM_CHARTER_VERSION;
/** Demandes de conservation montrées au chauffeur : 30 derniers jours. */
const FOOTAGE_REQUESTS_DAYS = 30;

type Prisma = Pick<PrismaService, 'dashcamCharterAcceptance'>;

/** Charte acceptée dans sa version en vigueur ? Sinon 403 motivé (l'app propose de la lire). */
export async function assertDashcamCharter(prisma: Prisma, userId: string) {
  const accepted = await prisma.dashcamCharterAcceptance.findFirst({ where: { userId, version: dashcamCharterVersion() } });
  if (!accepted) {
    throw new ForbiddenException({
      statusCode: 403,
      code: 'DASHCAM_CHARTER_REQUIRED',
      message: 'Acceptez la charte caméra embarquée avant de recevoir ou de démarrer un trajet',
    });
  }
}

export class AcceptCharterDto {
  @IsString()
  @MaxLength(20)
  version!: string;
}

export class FootageRequestDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(300, { message: 'Motif limité à 300 caractères' })
  reason?: string;
}

@Injectable()
export class DashcamService {
  constructor(private prisma: PrismaService, private audit: AuditService, private notifications: NotificationsService) {}

  async charter(userId: string) {
    const version = dashcamCharterVersion();
    const accepted = await this.prisma.dashcamCharterAcceptance.findFirst({ where: { userId, version } });
    return { version, accepted: Boolean(accepted), acceptedAt: accepted?.acceptedAt ?? null };
  }

  async accept(userId: string, version: string, ctx: { ipAddress?: string; userAgent?: string }) {
    if (version !== dashcamCharterVersion()) {
      throw new BadRequestException('La charte caméra embarquée a changé : relisez-la avant de l’accepter');
    }
    const existing = await this.prisma.dashcamCharterAcceptance.findFirst({ where: { userId, version } });
    if (!existing) {
      await this.prisma.dashcamCharterAcceptance.create({ data: { userId, version } });
      await this.audit.log({ userId, action: 'dashcam.charter.accept', entity: 'DashcamCharterAcceptance', metadata: { version }, ...ctx });
    }
    return this.charter(userId);
  }

  /**
   * L'équipe demande au chauffeur du trajet de conserver l'enregistrement (avant
   * son effacement automatique). Une seule demande par incident (idempotent).
   */
  async requestFootage(adminId: string, incidentId: string, reason: string | undefined, ctx: { ipAddress?: string; userAgent?: string }) {
    const incident = await this.prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) throw new NotFoundException('Incident introuvable');
    if (incident.footageRequestedAt) return this.incidentView(incident);
    const trip = await this.prisma.trip.findUnique({ where: { id: incident.tripId }, select: { driverId: true, scheduledAt: true } });
    if (!trip?.driverId) throw new ConflictException('Aucun chauffeur sur ce trajet : pas d’enregistrement à demander');
    const now = new Date();
    const updated = await this.prisma.incident.update({
      where: { id: incidentId },
      data: { footageRequestedAt: now, footageRequestedBy: adminId, footageDriverId: trip.driverId },
    });
    await this.notifications.notify(trip.driverId, 'dashcam.footage_request', 'Conservez l’enregistrement',
      'Un incident a été signalé sur l’un de vos trajets : conservez l’enregistrement de votre caméra. L’équipe XLCAB vous indiquera comment le remettre.',
      { incidentId, tripId: incident.tripId });
    await this.audit.log({ userId: adminId, action: 'dashcam.footage.request', entity: 'Incident', entityId: incidentId, metadata: { reason: reason ?? null }, ...ctx });
    return this.incidentView(updated);
  }

  /** Demandes de conservation adressées au chauffeur (30 derniers jours). */
  async myFootageRequests(driverId: string, now = new Date()) {
    const rows = await this.prisma.incident.findMany({
      where: { footageDriverId: driverId, footageRequestedAt: { gte: new Date(now.getTime() - FOOTAGE_REQUESTS_DAYS * 86400_000) } },
      orderBy: { footageRequestedAt: 'desc' },
      take: 20,
    });
    const trips = rows.length
      ? await this.prisma.trip.findMany({
          where: { id: { in: rows.map((r) => r.tripId) } },
          select: { id: true, scheduledAt: true, originAddress: true, destinationAddress: true },
        })
      : [];
    return rows.map((r) => {
      const t = trips.find((x) => x.id === r.tripId);
      return {
        incidentId: r.id,
        tripId: r.tripId,
        // Le trajet seulement : jamais le motif ni l'émetteur du signalement.
        tripAt: t?.scheduledAt ?? null,
        origin: t?.originAddress ?? null,
        destination: t?.destinationAddress ?? null,
        requestedAt: r.footageRequestedAt,
        acknowledgedAt: r.footageAcknowledgedAt ?? null,
      };
    });
  }

  async acknowledge(driverId: string, incidentId: string, ctx: { ipAddress?: string; userAgent?: string }) {
    const incident = await this.prisma.incident.findUnique({ where: { id: incidentId } });
    // Demande adressée à un autre chauffeur : « introuvable » (ownership).
    if (!incident || incident.footageDriverId !== driverId || !incident.footageRequestedAt) throw new NotFoundException('Demande introuvable');
    if (!incident.footageAcknowledgedAt) {
      await this.prisma.incident.update({ where: { id: incidentId }, data: { footageAcknowledgedAt: new Date() } });
      await this.audit.log({ userId: driverId, action: 'dashcam.footage.acknowledge', entity: 'Incident', entityId: incidentId, ...ctx });
    }
    return { incidentId, acknowledged: true };
  }

  private incidentView(i: { id: string; footageRequestedAt: Date | null; footageAcknowledgedAt: Date | null; footageDriverId: string | null }) {
    return {
      incidentId: i.id,
      footageRequestedAt: i.footageRequestedAt ?? null,
      footageAcknowledgedAt: i.footageAcknowledgedAt ?? null,
      footageDriverId: i.footageDriverId ?? null,
    };
  }
}

@Controller('api/v1/drivers/me')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class DriverDashcamController {
  constructor(private dashcam: DashcamService) {}

  @Get('dashcam-charter')
  charter(@Req() req: any) {
    return this.dashcam.charter(req.user.sub);
  }

  @Post('dashcam-charter')
  @HttpCode(HttpStatus.OK)
  accept(@Req() req: any, @Body() dto: AcceptCharterDto) {
    return this.dashcam.accept(req.user.sub, dto.version, AuditService.context(req));
  }

  @Get('footage-requests')
  footageRequests(@Req() req: any) {
    return this.dashcam.myFootageRequests(req.user.sub);
  }

  @Post('footage-requests/:incidentId/acknowledge')
  @HttpCode(HttpStatus.OK)
  acknowledge(@Req() req: any, @Param('incidentId', ParseUUIDPipe) incidentId: string) {
    return this.dashcam.acknowledge(req.user.sub, incidentId, AuditService.context(req));
  }
}

@Controller('api/v1/admin/incidents')
@UseGuards(JwtAuthGuard, RolesGuard, TwoFactorGuard)
@Roles('admin')
export class AdminFootageController {
  constructor(private dashcam: DashcamService) {}

  @Post(':id/footage-request')
  @HttpCode(HttpStatus.OK)
  request(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FootageRequestDto) {
    return this.dashcam.requestFootage(req.user.sub, id, dto.reason, AuditService.context(req));
  }
}

@Module({
  imports: [TwoFactorModule],
  controllers: [DriverDashcamController, AdminFootageController],
  providers: [DashcamService],
})
export class DashcamModule {}
