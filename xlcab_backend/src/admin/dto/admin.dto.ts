import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const USER_ROLES = ['passenger', 'driver', 'corporate_admin', 'corporate_member', 'admin'] as const;
export const TRIP_STATUSES = ['awaiting_payment', 'pending', 'searching', 'no_driver', 'accepted', 'started', 'completed', 'cancelled', 'attached'] as const;
export const INCIDENT_STATUSES = ['open', 'acknowledged', 'resolved'] as const;

export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;
}

export class UsersQueryDto extends PageQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(USER_ROLES)
  role?: string;
}

export class TripsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(TRIP_STATUSES)
  status?: string;
}

export class IncidentsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(INCIDENT_STATUSES)
  status?: string;
}

export class AuditQueryDto extends PageQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  action?: string;
}

/** Décision sur un document chauffeur. */
export class ReviewDocumentDto {
  @IsIn(['approved', 'rejected'])
  status!: 'approved' | 'rejected';

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ApproveDriverDto {
  /** Habilitation Navette Rose (Partie 1.3 : conductrice). Décision admin. */
  @IsBoolean()
  roseEligible!: boolean;
}

export class RejectDriverDto {
  /** Motif communiqué au candidat : obligatoire et explicite. */
  @Transform(trim)
  @IsString()
  @MinLength(10, { message: 'Motif de refus : 10 caractères minimum' })
  @MaxLength(1000)
  reason!: string;
}

export class ResolveIncidentDto {
  @Transform(trim)
  @IsString()
  @MinLength(5, { message: 'Décrivez la résolution (5 caractères minimum)' })
  @MaxLength(2000)
  notes!: string;
}

/** Configuration d'une juridiction (Partie 11). */
export class UpdateJurisdictionDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  vatPassengerRate?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  vatParcelRate?: number;

  @IsOptional()
  @IsBoolean()
  requiresRevtc?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresVtcCard?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  minTripKm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  financialGuaranteePerVehicleCents?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  leadDpa?: string;
}
