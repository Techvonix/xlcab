import { Body, Controller, Get, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ArrayUnique, IsArray } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { AuditService } from '../audit/audit.service';
import { FeedbackService, RATING_TAGS, REPORT_REASONS, type RatingTag, type ReportReason } from './feedback.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class RateTripDto {
  @IsInt({ message: 'La note est un nombre entier d’étoiles' })
  @Min(1, { message: 'La note va de 1 à 5 étoiles' })
  @Max(5, { message: 'La note va de 1 à 5 étoiles' })
  stars!: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500, { message: 'Commentaire limité à 500 caractères' })
  comment?: string;

  /** Étiquettes rapides (« Conduite sûre », « Colis soigné »…), facultatives. */
  @IsOptional()
  @IsArray({ message: 'Étiquettes invalides' })
  @ArrayUnique({ message: 'Étiquettes invalides' })
  @IsIn(RATING_TAGS, { each: true, message: 'Étiquette inconnue' })
  tags?: RatingTag[];
}

export class ReportDriverDto {
  @IsIn(REPORT_REASONS, { message: 'Motif de signalement inconnu' })
  reason!: ReportReason;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000, { message: 'Description limitée à 1000 caractères' })
  details?: string;
}

/** Écran 10 : profil du chauffeur, note et signalement (passager de la course). */
@Controller('api/v1/trips/:id')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('passenger', 'corporate_member', 'corporate_admin')
export class FeedbackController {
  constructor(private feedback: FeedbackService) {}

  @Get('driver')
  driver(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.feedback.driverProfile(req.user, id);
  }

  @Post('rating')
  @HttpCode(HttpStatus.CREATED)
  rate(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RateTripDto) {
    return this.feedback.rate(req.user, id, dto.stars, dto.comment, AuditService.context(req), dto.tags ?? []);
  }

  @Post('report')
  @HttpCode(HttpStatus.CREATED)
  report(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReportDriverDto) {
    return this.feedback.report(req.user, id, dto.reason, dto.details, AuditService.context(req));
  }
}

@Module({
  controllers: [FeedbackController],
  providers: [FeedbackService],
})
export class FeedbackModule {}
