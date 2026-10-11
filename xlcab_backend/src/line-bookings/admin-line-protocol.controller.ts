import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { AssignDepartureDto, PenaltyDecisionDto, ReviewCancellationDto } from './dto';
import { RescueService } from './rescue.service';
import { TwoFactorGuard } from '../two-factor/two-factor.guard';

export class CancellationsQueryDto {
  @IsOptional()
  @IsIn(['counted', 'not_counted', 'justification_pending', 'justified', 'waived'], { message: 'Statut invalide' })
  status?: string;
}

export class PenaltiesQueryDto {
  @IsOptional()
  @IsIn(['pending', 'contested', 'applied', 'cancelled'], { message: 'Statut invalide' })
  status?: string;
}

/**
 * Protocole d'annulation chauffeur vu par l'équipe XLCAB : départs en
 * danger (affectation manuelle d'un chauffeur), justificatifs de force
 * majeure, contestations de pénalité. 2FA comme tout l'admin.
 */
@Controller('api/v1/admin')
@UseGuards(JwtAuthGuard, RolesGuard, TwoFactorGuard)
@Roles('admin')
export class AdminLineProtocolController {
  constructor(private rescue: RescueService) {}

  @Get('departures/at-risk')
  atRisk() {
    return this.rescue.atRisk();
  }

  @Get('departures/:id/candidates')
  candidates(@Param('id', ParseUUIDPipe) id: string) {
    return this.rescue.rescueCandidates(id);
  }

  @Post('departures/:id/assign')
  @HttpCode(HttpStatus.OK)
  assign(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDepartureDto) {
    return this.rescue.assignManually(req.user.sub, id, dto.driverId, dto.vehicleId);
  }

  @Get('cancellations')
  cancellations(@Query() q: CancellationsQueryDto) {
    return this.rescue.listCancellations(q.status);
  }

  @Patch('cancellations/:id')
  review(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewCancellationDto) {
    return this.rescue.reviewCancellation(req.user.sub, id, dto.status, dto.reason);
  }

  @Get('penalties')
  penalties(@Query() q: PenaltiesQueryDto) {
    return this.rescue.listPenalties(q.status);
  }

  @Patch('penalties/:id')
  decide(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PenaltyDecisionDto) {
    return this.rescue.decidePenalty(req.user.sub, id, dto.decision, dto.reason);
  }
}
