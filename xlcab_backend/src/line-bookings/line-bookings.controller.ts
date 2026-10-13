import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { BookLineDto, InviteBackupDto, JustifyDto, QrCheckInDto, ReasonDto, VehicleChoiceDto } from './dto';
import { LineBookingsService } from './line-bookings.service';
import { RescueService } from './rescue.service';

/** Réservation d'une place sur un départ de ligne régulière. */
@Controller('api/v1/lines/bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
// Un chauffeur peut réserver une place comme tout voyageur, sauf sur un départ qu'il assure.
@Roles('passenger', 'corporate_member', 'corporate_admin', 'driver')
export class LineBookingsController {
  constructor(private bookings: LineBookingsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  book(@Req() req: any, @Body() dto: BookLineDto) {
    return this.bookings.book(req.user.sub, dto);
  }

  /** Sièges déjà pris sur un départ (numéros seulement). */
  @Get('seats/:departureId')
  seatMap(@Param('departureId', ParseUUIDPipe) departureId: string) {
    return this.bookings.seatMap(departureId);
  }
}

/**
 * Côté chauffeur : opérer un départ (embarquement, démarrage, fin),
 * l'annuler (protocole de secours), réserves, reprises, annulations.
 */
@Controller('api/v1/operators/me')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class LineOperationsController {
  constructor(
    private bookings: LineBookingsService,
    private rescue: RescueService,
  ) {}

  @Get('assignments')
  assignments(@Req() req: any) {
    return this.bookings.assignments(req.user.sub);
  }

  @Get('departures/:id/manifest')
  manifest(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.manifest(req.user.sub, id);
  }

  @Post('departures/:id/ready')
  @HttpCode(HttpStatus.OK)
  ready(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.ready(req.user.sub, id);
  }

  @Post('departures/:id/checkin')
  @HttpCode(HttpStatus.OK)
  checkIn(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: QrCheckInDto) {
    return this.bookings.checkIn(req.user.sub, id, dto.qrCode);
  }

  @Post('departures/:id/start')
  @HttpCode(HttpStatus.OK)
  start(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.start(req.user, id, AuditService.context(req));
  }

  @Post('departures/:id/complete')
  @HttpCode(HttpStatus.OK)
  complete(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.complete(req.user, id, AuditService.context(req));
  }

  @Post('departures/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.rescue.cancelDeparture(req.user.sub, id, dto.reason);
  }

  // ── Réserves de mes lignes ──

  @Get('lines/:id/backups')
  backups(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.rescue.backups(req.user.sub, id);
  }

  @Post('lines/:id/backups')
  @HttpCode(HttpStatus.OK)
  invite(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: InviteBackupDto) {
    return this.rescue.inviteBackup(req.user.sub, id, dto);
  }

  @Delete('lines/:id/backups/:rank')
  removeBackup(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Param('rank', ParseIntPipe) rank: number) {
    return this.rescue.removeBackup(req.user.sub, id, rank);
  }

  // ── Mes rôles de réserve ──

  @Get('backups')
  myBackups(@Req() req: any) {
    return this.rescue.myBackupRoles(req.user.sub);
  }

  @Post('backups/:id/accept')
  @HttpCode(HttpStatus.OK)
  acceptBackup(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VehicleChoiceDto) {
    return this.rescue.respondBackup(req.user.sub, id, true, dto.vehicleId);
  }

  @Post('backups/:id/decline')
  @HttpCode(HttpStatus.OK)
  declineBackup(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.rescue.respondBackup(req.user.sub, id, false);
  }

  // ── Reprises proposées ──

  @Get('rescues')
  rescues(@Req() req: any) {
    return this.rescue.myOffers(req.user.sub);
  }

  @Post('rescues/:id/accept')
  @HttpCode(HttpStatus.OK)
  acceptRescue(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VehicleChoiceDto) {
    return this.rescue.respondOffer(req.user.sub, id, true, dto.vehicleId);
  }

  @Post('rescues/:id/decline')
  @HttpCode(HttpStatus.OK)
  declineRescue(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.rescue.respondOffer(req.user.sub, id, false);
  }

  // ── Mes annulations et pénalités ──

  @Get('cancellations')
  cancellations(@Req() req: any) {
    return this.rescue.myCancellations(req.user.sub);
  }

  @Post('cancellations/:id/justify')
  @HttpCode(HttpStatus.OK)
  justify(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: JustifyDto) {
    return this.rescue.justify(req.user.sub, id, dto.justification);
  }

  @Post('penalties/:id/contest')
  @HttpCode(HttpStatus.OK)
  contest(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.rescue.contest(req.user.sub, id, dto.reason);
  }
}
