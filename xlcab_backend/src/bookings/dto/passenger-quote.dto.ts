import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SHUTTLE_TYPES, ShuttleType } from '../../matching/matching.constants';

export class LatLngDto {
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  lng!: number;
}

/**
 * POST /api/v1/bookings/passenger/quote (Partie 6).
 *
 * Aucune distance ni aucun prix n'est accepté du client : la distance
 * est recalculée par le serveur à partir des coordonnées.
 */
export class PassengerQuoteDto {
  @ValidateNested()
  @Type(() => LatLngDto)
  origin!: LatLngDto;

  @ValidateNested()
  @Type(() => LatLngDto)
  destination!: LatLngDto;

  @IsIn(SHUTTLE_TYPES)
  shuttleType!: ShuttleType;

  /** Date de départ (ISO 8601). Au moins 2 h dans le futur (Partie 7, écran 6). */
  @IsISO8601({ strict: true })
  scheduledAt!: string;

  // Partie 7 : "passagers 1-7".
  @IsInt()
  @Min(1)
  @Max(7)
  seats!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(7)
  childSeats?: number;

  @IsOptional()
  @IsBoolean()
  wifi?: boolean;

  @IsOptional()
  @IsBoolean()
  extraLuggage?: boolean;

  /** "Toggle colis" : transforme le trajet en trajet mixte. */
  @IsOptional()
  @IsBoolean()
  withParcel?: boolean;
}

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Réservation effective : le devis + les adresses lisibles (affichage,
 * justificatif). Les coordonnées restent la référence pour le prix.
 */
export class CreatePassengerBookingDto extends PassengerQuoteDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  originAddress!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  destinationAddress!: string;
}

/** GET /bookings/passenger/history?limit=20&page=1 */
export class HistoryQueryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;
}
