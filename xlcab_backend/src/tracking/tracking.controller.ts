import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TrackingService } from './tracking.service';

@Controller('api/v1/trips')
@UseGuards(JwtAuthGuard)
export class TrackingController {
  constructor(private tracking: TrackingService) {}

  /**
   * Partie 6 : GET /trips/:id/tracking. Chargement de l'écran de suivi
   * et fallback polling 10 s quand le WebSocket est indisponible.
   */
  @Get(':id/tracking')
  async snapshot(@Req() req: any, @Param('id', ParseUUIDPipe) tripId: string) {
    const snapshot = await this.tracking.getSnapshot(
      { userId: req.user.sub, role: req.user.role, tokenExp: req.user.exp },
      tripId,
    );
    // Même réponse pour "inexistant" et "pas à vous" (anti-énumération).
    if (!snapshot) throw new NotFoundException('Trajet introuvable');
    return snapshot;
  }
}
