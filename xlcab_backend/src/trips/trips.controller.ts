import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { AuditService } from '../audit/audit.service';
import { TripsService } from './trips.service';

export class StartTripDto {
  /** QR code d'embarquement scanné par le chauffeur (facultatif). */
  @IsOptional()
  @IsUUID()
  qrCode?: string;
}

export class CancelTripDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3, { message: 'Indiquez le motif de l’annulation' })
  @MaxLength(500)
  reason!: string;
}

/** Endpoints "Trips" de la Partie 6 (hors match/accept/refuse : module Matching). */
@Controller('api/v1/trips')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TripsController {
  constructor(private trips: TripsService) {}

  @Get(':id')
  get(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.trips.getTrip(req.user, id);
  }

  @Post(':id/start')
  @Roles('driver')
  @HttpCode(HttpStatus.OK)
  start(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StartTripDto) {
    return this.trips.start(req.user, id, dto.qrCode, AuditService.context(req));
  }

  @Post(':id/complete')
  @Roles('driver')
  @HttpCode(HttpStatus.OK)
  complete(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.trips.complete(req.user, id, AuditService.context(req));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelTripDto) {
    return this.trips.cancel(req.user, id, dto.reason, AuditService.context(req));
  }
}
