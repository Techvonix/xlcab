import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { OPERATOR_KINDS, OPERATOR_SERVICES, PRICING_MODES } from './line-schedule';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// ── Profil opérateur ──────────────────────────────────────────────────

export class OperatorProfileDto {
  @IsIn(OPERATOR_KINDS, { message: 'Type d’opérateur invalide' })
  kind!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120, { message: 'Nom commercial limité à 120 caractères' })
  legalName?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s/g, '') : value))
  @Matches(/^\d{14}$/, { message: 'SIRET invalide (14 chiffres)' })
  siret?: string;

  /** N° de licence LOTI / registre des transporteurs (vérifié par XLCAB). */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60, { message: 'Numéro de licence limité à 60 caractères' })
  transportLicense?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30, { message: '30 villes au maximum' })
  @IsString({ each: true })
  @MaxLength(80, { each: true, message: 'Nom de ville limité à 80 caractères' })
  cities?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(OPERATOR_SERVICES, { each: true, message: 'Type de prestation invalide' })
  services?: string[];

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000, { message: 'Présentation limitée à 1000 caractères' })
  description?: string;

  /** Acceptation des conditions générales opérateur (avec leur version). */
  @IsOptional()
  @IsBoolean()
  acceptTerms?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  termsVersion?: string;
}

// ── Lignes régulières ─────────────────────────────────────────────────

/** Champs modifiables d'une ligne (le trajet, lui, ne change pas). */
export class UpdateLineDto {
  @IsOptional()
  @IsUUID('4', { message: 'Véhicule invalide' })
  vehicleId?: string;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Rayon de prise en charge : entre 1 et 30 km' })
  @Max(30, { message: 'Rayon de prise en charge : entre 1 et 30 km' })
  pickupRadiusKm?: number;

  @IsOptional()
  @Matches(HHMM, { message: 'Heure invalide (HH:MM)' })
  departureTime?: string;

  /** Départ du retour, le même jour ; null = pas de retour. */
  @IsOptional()
  @Matches(HHMM, { message: 'Heure invalide (HH:MM)' })
  returnTime?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Choisissez au moins un jour' })
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true, message: 'Jour invalide (1 = lundi … 7 = dimanche)' })
  @Max(7, { each: true, message: 'Jour invalide (1 = lundi … 7 = dimanche)' })
  daysOfWeek?: number[];

  @IsOptional()
  @Matches(DATE, { message: 'Date invalide (AAAA-MM-JJ)' })
  endDate?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Nombre de places invalide' })
  @Max(60, { message: 'Nombre de places invalide' })
  seats?: number;

  @IsOptional()
  @IsInt()
  @Min(0, { message: 'Nombre de bagages invalide' })
  @Max(100, { message: 'Nombre de bagages invalide' })
  luggage?: number;

  @IsOptional()
  @IsIn(PRICING_MODES, { message: 'Mode de prix invalide' })
  pricingMode?: string;

  /** Prix TTC en centimes : par place ou pour le véhicule. */
  @IsOptional()
  @IsInt()
  @Min(100, { message: 'Prix invalide' })
  @Max(1_000_000, { message: 'Prix invalide' })
  priceCents?: number;

  @IsOptional()
  @IsInt()
  @Min(5, { message: 'Durée invalide' })
  @Max(24 * 60, { message: 'Durée invalide' })
  durationMin?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000, { message: 'Conditions limitées à 1000 caractères' })
  conditions?: string;
}

export class CreateLineDto {
  @IsUUID('4', { message: 'Véhicule invalide' })
  vehicleId!: string;

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

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Rayon de prise en charge : entre 1 et 30 km' })
  @Max(30, { message: 'Rayon de prise en charge : entre 1 et 30 km' })
  pickupRadiusKm?: number;

  @Matches(HHMM, { message: 'Heure invalide (HH:MM)' })
  departureTime!: string;

  @IsOptional()
  @Matches(HHMM, { message: 'Heure invalide (HH:MM)' })
  returnTime?: string | null;

  @IsArray()
  @ArrayMinSize(1, { message: 'Choisissez au moins un jour' })
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true, message: 'Jour invalide (1 = lundi … 7 = dimanche)' })
  @Max(7, { each: true, message: 'Jour invalide (1 = lundi … 7 = dimanche)' })
  daysOfWeek!: number[];

  @Matches(DATE, { message: 'Date invalide (AAAA-MM-JJ)' })
  startDate!: string;

  @IsOptional()
  @Matches(DATE, { message: 'Date invalide (AAAA-MM-JJ)' })
  endDate?: string | null;

  @IsInt()
  @Min(1, { message: 'Nombre de places invalide' })
  @Max(60, { message: 'Nombre de places invalide' })
  seats!: number;

  @IsInt()
  @Min(0, { message: 'Nombre de bagages invalide' })
  @Max(100, { message: 'Nombre de bagages invalide' })
  luggage!: number;

  @IsIn(PRICING_MODES, { message: 'Mode de prix invalide' })
  pricingMode!: string;

  /** Prix TTC en centimes : par place ou pour le véhicule. */
  @IsInt()
  @Min(100, { message: 'Prix invalide' })
  @Max(1_000_000, { message: 'Prix invalide' })
  priceCents!: number;

  @IsOptional()
  @IsInt()
  @Min(5, { message: 'Durée invalide' })
  @Max(24 * 60, { message: 'Durée invalide' })
  durationMin?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000, { message: 'Conditions limitées à 1000 caractères' })
  conditions?: string;
}

/** Jour sans départ (sans `seats`) ou à capacité réduite. */
export class LineExceptionDto {
  @Matches(DATE, { message: 'Date invalide (AAAA-MM-JJ)' })
  date!: string;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Nombre de places invalide' })
  @Max(60, { message: 'Nombre de places invalide' })
  seats?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200, { message: 'Motif limité à 200 caractères' })
  reason?: string;
}

// ── Départs ───────────────────────────────────────────────────────────

export class ConfirmDeparturesDto {
  /** Une ligne ; sans elle, toutes les lignes de l'opérateur. */
  @IsOptional()
  @IsUUID('4', { message: 'Ligne invalide' })
  lineId?: string;

  /** Confirme les départs jusqu'à cette date incluse. */
  @Matches(DATE, { message: 'Date invalide (AAAA-MM-JJ)' })
  until!: string;
}

export class DeparturesQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'Ligne invalide' })
  lineId?: string;

  @IsOptional()
  @IsIn(['to_confirm', 'open', 'closed'], { message: 'Statut invalide' })
  status?: string;
}

export class UpdateDepartureDto {
  /** true : plus de vente sur ce départ ; false : de nouveau ouvert. */
  @IsBoolean()
  closed!: boolean;
}

// ── Recherche ─────────────────────────────────────────────────────────

export class LineSearchDto {
  @Type(() => Number)
  @IsLatitude({ message: 'Latitude invalide' })
  fromLat!: number;

  @Type(() => Number)
  @IsLongitude({ message: 'Longitude invalide' })
  fromLng!: number;

  @Type(() => Number)
  @IsLatitude({ message: 'Latitude invalide' })
  toLat!: number;

  @Type(() => Number)
  @IsLongitude({ message: 'Longitude invalide' })
  toLng!: number;

  @Matches(DATE, { message: 'Date invalide (AAAA-MM-JJ)' })
  date!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Nombre de places invalide' })
  @Max(60, { message: 'Nombre de places invalide' })
  seats!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'Nombre de bagages invalide' })
  @Max(100, { message: 'Nombre de bagages invalide' })
  luggage?: number;

  /** Heure souhaitée ; sans elle, tous les départs du jour. */
  @IsOptional()
  @Matches(HHMM, { message: 'Heure invalide (HH:MM)' })
  time?: string;

  /** Écart accepté autour de l'heure souhaitée, en minutes. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'Flexibilité invalide' })
  @Max(720, { message: 'Flexibilité invalide' })
  flexMin?: number;
}
