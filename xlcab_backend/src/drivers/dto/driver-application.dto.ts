import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SHUTTLE_TYPES, ShuttleType } from '../../matching/matching.constants';
import { DOCUMENT_TYPES, DocumentType } from '../drivers.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

// Langues proposées dans l'app (Partie 1.1 : expansion ES, IT, DE, PT).
export const DRIVER_LANGUAGES = ['fr', 'en', 'ga', 'es', 'it', 'de', 'pt', 'ar'] as const;

/** Étape 1 — infos perso. */
export class PersonalInfoDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  firstName!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  lastName!: string;

  /** Format international E.164, ex. +33612345678. */
  @Matches(/^\+[1-9]\d{7,14}$/, { message: 'Numéro de téléphone au format international (+33…)' })
  phone!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(DRIVER_LANGUAGES.length)
  @IsIn(DRIVER_LANGUAGES, { each: true })
  languages!: string[];
}

/** Étape 3 — documents personnels (numéros et échéances). */
export class LicensesDto {
  @Transform(upper)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  licenseNumber!: string;

  @IsISO8601({ strict: true })
  licenseExpiry!: string;

  @IsOptional()
  @Transform(upper)
  @IsString()
  @MaxLength(30)
  vtcCardNumber?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  vtcCardExpiry?: string;

  @IsOptional()
  @Transform(upper)
  @IsString()
  @MaxLength(30)
  revtcNumber?: string;
}

/** Étape 4 — infos véhicule. */
export class VehicleInfoDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  brand!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  model!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  color!: string;

  /** Immatriculation française (SIV) : AB-123-CD. */
  @Transform(upper)
  @Matches(/^[A-Z]{2}-\d{3}-[A-Z]{2}$/, { message: 'Immatriculation au format AB-123-CD' })
  plate!: string;

  // Navettes 7+ places (Partie 1). Un VTC transporte au plus 8 passagers
  // (9 places conducteur compris) : au-delà, c'est du transport collectif.
  @IsInt()
  @Min(7)
  @Max(8)
  capacity!: number;

  /** Navette souhaitée. La Rose reste soumise à l'habilitation admin. */
  @IsIn(SHUTTLE_TYPES)
  shuttleType!: ShuttleType;

  @IsBoolean()
  pmrEquipped!: boolean;

  /** Partie 8 : "Dashcam obligatoire". */
  @Equals(true, { message: 'Une dashcam est obligatoire' })
  dashcamInstalled!: boolean;

  @IsISO8601({ strict: true })
  insuranceExpiry!: string;

  @IsISO8601({ strict: true })
  technicalControlExpiry!: string;
}

/**
 * POST /api/v1/drivers/apply — étape 5 "envoi validation". Les documents
 * ont été envoyés un par un aux étapes 2 et 3 (POST /drivers/me/documents).
 */
export class DriverApplicationDto {
  @ValidateNested()
  @Type(() => PersonalInfoDto)
  personal!: PersonalInfoDto;

  @ValidateNested()
  @Type(() => LicensesDto)
  licenses!: LicensesDto;

  @ValidateNested()
  @Type(() => VehicleInfoDto)
  vehicle!: VehicleInfoDto;

  /** Formé à l'accueil PMR (Partie 8 : obligatoire pour la navette Accessibilité). */
  @IsBoolean()
  pmrTrained!: boolean;

  /**
   * Consentement explicite au traitement des documents pour vérification
   * (Partie 8, RGPD). Case non pré-cochée côté app.
   */
  @Equals(true, { message: 'Le consentement est requis pour envoyer la candidature' })
  consent!: boolean;
}

/** Champ texte accompagnant le fichier (multipart/form-data). */
export class UploadDocumentDto {
  @IsIn(DOCUMENT_TYPES)
  type!: DocumentType;
}
