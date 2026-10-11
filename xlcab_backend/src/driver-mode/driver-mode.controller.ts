import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { DriverModeService } from './driver-mode.service';

export class SetOnlineDto {
  @IsBoolean({ message: 'online doit valoir true ou false' })
  online!: boolean;
}

/**
 * Endpoints "Drivers" de la Partie 6 propres au mode chauffeur (écran 15).
 * La candidature (apply, documents) reste dans DriversController.
 * Les positions passent par le WebSocket (driver:location) : pas de
 * POST /drivers/me/location en doublon.
 */
@Controller('api/v1/drivers/me')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class DriverModeController {
  constructor(private driverMode: DriverModeService) {}

  @Post('online')
  @HttpCode(HttpStatus.OK)
  setOnline(@Req() req: any, @Body() dto: SetOnlineDto) {
    return this.driverMode.setOnline(req.user, dto.online);
  }

  /** État au lancement de l'app : en ligne, note, offre en cours éventuelle. */
  @Get('status')
  status(@Req() req: any) {
    return this.driverMode.status(req.user);
  }

  @Get('trips')
  missions(@Req() req: any) {
    return this.driverMode.missions(req.user);
  }

  @Get('earnings')
  earnings(@Req() req: any) {
    return this.driverMode.earnings(req.user);
  }
}
