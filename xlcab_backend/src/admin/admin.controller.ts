import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { TwoFactorGuard } from '../two-factor/two-factor.guard';
import { AdminCtx, AdminService } from './admin.service';
import {
  ApproveDriverDto,
  AuditQueryDto,
  IncidentsQueryDto,
  RejectDriverDto,
  ResolveIncidentDto,
  ReviewDocumentDto,
  TripsQueryDto,
  UpdateJurisdictionDto,
  UsersQueryDto,
} from './dto/admin.dto';

const ctx = (req: any): AdminCtx => ({ adminId: req.user.sub, ...AuditService.context(req) });

/**
 * Endpoints "Admin" de la Partie 6. Triple contrôle : jeton valide (et non
 * révoqué), rôle admin, preuve de double authentification (Partie 8).
 */
@Controller('api/v1/admin')
@UseGuards(JwtAuthGuard, RolesGuard, TwoFactorGuard)
@Roles('admin')
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('analytics')
  analytics() {
    return this.admin.analytics();
  }

  @Get('drivers/pending')
  pendingDrivers() {
    return this.admin.pendingDrivers();
  }

  /** Fichier d'un document : jamais d'URL publique, consultation tracée. */
  @Get('drivers/:id/documents/:docId/file')
  async documentFile(
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
    @Param('id', ParseUUIDPipe) driverId: string,
    @Param('docId', ParseUUIDPipe) docId: string,
  ) {
    const file = await this.admin.documentFile(driverId, docId, ctx(req));
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${file.filename}"`,
      // Données sensibles : ni cache navigateur ni proxy.
      'Cache-Control': 'no-store',
      // Un PDF piégé ouvert dans l'onglet ne peut rien exécuter.
      'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    });
    return new StreamableFile(file.data);
  }

  @Post('drivers/:id/documents/:docId/review')
  @HttpCode(HttpStatus.OK)
  reviewDocument(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) driverId: string,
    @Param('docId', ParseUUIDPipe) docId: string,
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.admin.reviewDocument(driverId, docId, dto.status, dto.reason, ctx(req));
  }

  @Post('drivers/:id/approve')
  @HttpCode(HttpStatus.OK)
  approve(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveDriverDto) {
    return this.admin.approveDriver(id, dto.roseEligible, ctx(req));
  }

  @Post('drivers/:id/reject')
  @HttpCode(HttpStatus.OK)
  reject(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectDriverDto) {
    return this.admin.rejectDriver(id, dto.reason, ctx(req));
  }

  @Get('users')
  users(@Query() q: UsersQueryDto) {
    return this.admin.users(q);
  }

  @Get('trips')
  trips(@Query() q: TripsQueryDto) {
    return this.admin.trips(q);
  }

  @Get('incidents')
  incidents(@Query() q: IncidentsQueryDto) {
    return this.admin.incidents(q);
  }

  @Post('incidents/:id/acknowledge')
  @HttpCode(HttpStatus.OK)
  acknowledge(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.acknowledgeIncident(id, ctx(req));
  }

  @Post('incidents/:id/resolve')
  @HttpCode(HttpStatus.OK)
  resolve(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveIncidentDto) {
    return this.admin.resolveIncident(id, dto.notes, ctx(req));
  }

  @Get('audit-logs')
  auditLogs(@Query() q: AuditQueryDto) {
    return this.admin.auditLogs(q);
  }

  @Patch('jurisdictions/:code')
  updateJurisdiction(@Req() req: any, @Param('code') code: string, @Body() dto: UpdateJurisdictionDto) {
    return this.admin.updateJurisdiction(code.toUpperCase(), dto, ctx(req));
  }
}

/** Utils de la Partie 6 : lecture des juridictions (tout utilisateur connecté). */
@Controller('api/v1/jurisdictions')
@UseGuards(JwtAuthGuard)
export class JurisdictionsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.jurisdictionConfig.findMany({ orderBy: { code: 'asc' } });
  }

  @Get(':code')
  async get(@Param('code') code: string) {
    const config = await this.prisma.jurisdictionConfig.findUnique({ where: { code: code.toUpperCase() } });
    if (!config) throw new NotFoundException('Juridiction introuvable');
    return config;
  }
}
