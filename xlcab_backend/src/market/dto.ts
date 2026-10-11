import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Demande de transport (brouillon, ou publiée tout de suite avec `publish`). */
export class CreateRequestDto {
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Adresse de départ invalide' })
  @MaxLength(300)
  originAddress!: string;

  @IsLatitude({ message: 'Latitude invalide' })
  originLat!: number;

  @IsLongitude({ message: 'Longitude invalide' })
  originLng!: number;

  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Adresse d’arrivée invalide' })
  @MaxLength(300)
  destinationAddress!: string;

  @IsLatitude({ message: 'Latitude invalide' })
  destinationLat!: number;

  @IsLongitude({ message: 'Longitude invalide' })
  destinationLng!: number;

  @IsISO8601({ strict: true }, { message: 'Date de départ invalide' })
  departureAt!: string;

  @IsOptional()
  @IsInt()
  @Min(0, { message: 'Flexibilité invalide' })
  @Max(720, { message: 'Flexibilité invalide' })
  flexMin?: number;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Date de retour invalide' })
  returnAt?: string;

  @IsInt()
  @Min(1, { message: 'Nombre de passagers invalide' })
  @Max(60, { message: 'Nombre de passagers invalide' })
  passengers!: number;

  @IsOptional()
  @IsInt()
  @Min(0, { message: 'Nombre de bagages invalide' })
  @Max(100, { message: 'Nombre de bagages invalide' })
  luggage?: number;

  @IsOptional()
  @IsBoolean()
  accessible?: boolean;

  @IsOptional()
  @IsBoolean()
  recurring?: boolean;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120, { message: 'Fréquence limitée à 120 caractères' })
  frequency?: string;

  @IsOptional()
  @IsInt()
  @Min(100, { message: 'Budget invalide' })
  @Max(10_000_000, { message: 'Budget invalide' })
  budgetCents?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500, { message: 'Besoins particuliers limités à 500 caractères' })
  needs?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000, { message: 'Commentaire limité à 1000 caractères' })
  comment?: string;

  /** Agences / OTA : référence du dossier dans leur propre système. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60, { message: 'Référence limitée à 60 caractères' })
  partnerRef?: string;

  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}

export class CreateOfferDto {
  @IsUUID('4', { message: 'Véhicule invalide' })
  vehicleId!: string;

  /** Prix TTC proposé, en centimes. */
  @IsInt()
  @Min(100, { message: 'Prix invalide' })
  @Max(10_000_000, { message: 'Prix invalide' })
  priceCents!: number;

  /** Horaire de prise en charge ; par défaut celui de la demande. */
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Horaire invalide' })
  pickupAt?: string;

  @IsOptional()
  @IsBoolean()
  includesReturn?: boolean;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000, { message: 'Conditions limitées à 1000 caractères' })
  conditions?: string;

  /** Durée de validité de la proposition, en heures (24 h par défaut). */
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Validité invalide' })
  @Max(168, { message: 'Validité invalide' })
  validHours?: number;
}

export class MessageDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Message vide' })
  @MaxLength(1000, { message: 'Message limité à 1000 caractères' })
  body!: string;
}

export class MarketQueryDto {
  @IsOptional()
  @IsIn(['draft', 'published', 'offers_received', 'accepted', 'confirmed', 'cancelled', 'expired'], { message: 'Statut invalide' })
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;
}
