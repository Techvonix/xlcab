import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { DispatchService } from './dispatch.service';
import { MatchTripDto } from './dto/match-trip.dto';

/**
 * Endpoints "Trips & matching" de la Partie 6 relevant du dispatch.
 * start / complete / cancel / GET viendront avec le module Trips.
 */
@Controller('api/v1/trips')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TripsMatchingController {
  constructor(private dispatch: DispatchService) {}

  /**
   * Lance la recherche de chauffeur. 202 : la réponse arrive plus tard,
   * via l'événement WebSocket "status" (accepted / no_driver).
   * Ownership vérifiée dans le service (passager de la course ou admin).
   */
  @Post('match')
  @HttpCode(HttpStatus.ACCEPTED)
  match(@Req() req: any, @Body() dto: MatchTripDto) {
    return this.dispatch.startMatching(req.user, dto.tripId);
  }

  @Post(':id/accept')
  @Roles('driver')
  @HttpCode(HttpStatus.OK)
  accept(@Req() req: any, @Param('id', ParseUUIDPipe) tripId: string) {
    return this.dispatch.accept(req.user.sub, tripId);
  }

  /** Absent de la liste de la Partie 6, mais requis par la Partie 7 (écran 15). */
  @Post(':id/refuse')
  @Roles('driver')
  @HttpCode(HttpStatus.OK)
  refuse(@Req() req: any, @Param('id', ParseUUIDPipe) tripId: string) {
    return this.dispatch.refuse(req.user.sub, tripId);
  }
}
