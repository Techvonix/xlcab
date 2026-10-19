import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ArrayMaxSize, ArrayUnique, IsArray } from 'class-validator';
import { PARCEL_MAX_WEIGHT_KG } from '../parcels/parcels.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class BookLineDto {
  @IsUUID('4', { message: 'Départ invalide' })
  departureId!: string;

  @IsInt()
  @Min(1, { message: 'Nombre de places invalide' })
  @Max(60, { message: 'Nombre de places invalide' })
  seats!: number;

  @IsOptional()
  @IsInt()
  @Min(0, { message: 'Nombre de sièges enfant invalide' })
  @Max(10, { message: 'Nombre de sièges enfant invalide' })
  childSeats?: number;

  @IsOptional()
  @IsInt()
  @Min(0, { message: 'Nombre de bagages invalide' })
  @Max(100, { message: 'Nombre de bagages invalide' })
  luggage?: number;

  /** Information utile au chauffeur (jamais de donnée sensible). */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300, { message: 'Message limité à 300 caractères' })
  notes?: string;

  /**
   * Sièges choisis (lignes vendues à la place) : autant que de places.
   * Absent : les premiers sièges libres sont attribués.
   */
  @IsOptional()
  @IsArray({ message: 'Sièges invalides' })
  @ArrayMaxSize(60, { message: 'Sièges invalides' })
  @ArrayUnique({ message: 'Un même siège ne peut pas être choisi deux fois' })
  @IsInt({ each: true, message: 'Sièges invalides' })
  @Min(1, { each: true, message: 'Sièges invalides' })
  @Max(60, { each: true, message: 'Sièges invalides' })
  seatNumbers?: number[];

  /** Ligne avec arrêts : arrêt de montée (absent = départ de la ligne). */
  @IsOptional()
  @IsUUID('4', { message: 'Arrêt invalide' })
  boardStopId?: string;

  /** Arrêt de descente (absent = arrivée de la ligne). */
  @IsOptional()
  @IsUUID('4', { message: 'Arrêt invalide' })
  alightStopId?: string;
}

/** Colis confié à un départ de ligne : remis au chauffeur au point de montée. */
export class LineParcelDto {
  @IsUUID('4', { message: 'Départ invalide' })
  departureId!: string;

  /** Arrêt où l'expéditeur remet le colis (absent = départ de la ligne). */
  @IsOptional()
  @IsUUID('4', { message: 'Arrêt invalide' })
  boardStopId?: string;

  /** Arrêt où le destinataire le récupère (absent = arrivée de la ligne). */
  @IsOptional()
  @IsUUID('4', { message: 'Arrêt invalide' })
  alightStopId?: string;

  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Décrivez le contenu du colis' })
  @MaxLength(200)
  description!: string;

  @IsOptional()
  @IsBoolean()
  isFragile?: boolean;

  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.1)
  @Max(PARCEL_MAX_WEIGHT_KG, { message: `Poids maximal : ${PARCEL_MAX_WEIGHT_KG} kg` })
  weightKg!: number;

  @IsInt()
  @Min(1)
  @Max(300)
  lengthCm!: number;

  @IsInt()
  @Min(1)
  @Max(300)
  widthCm!: number;

  @IsInt()
  @Min(1)
  @Max(300)
  heightCm!: number;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  recipientName!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s.-]/g, '') : value))
  @Matches(/^(\+\d{8,15}|0\d{9})$/, { message: 'Numéro du destinataire invalide' })
  recipientPhone!: string;

  /** L'expéditeur certifie l'absence d'objets interdits (matières dangereuses, animaux, valeurs…). */
  @Equals(true, { message: 'Confirmez que le colis ne contient aucun objet interdit' })
  prohibitedItemsDeclined!: boolean;
}

export class QrCheckInDto {
  @IsString()
  @MaxLength(64, { message: 'QR code invalide' })
  qrCode!: string;
}

export class ReasonDto {
  @Transform(trim)
  @IsString()
  @MinLength(5, { message: 'Motif : 5 caractères minimum' })
  @MaxLength(500, { message: 'Motif limité à 500 caractères' })
  reason!: string;
}

export class JustifyDto {
  @Transform(trim)
  @IsString()
  @MinLength(10, { message: 'Justificatif : décrivez la situation (10 caractères minimum)' })
  @MaxLength(1000, { message: 'Justificatif limité à 1000 caractères' })
  justification!: string;
}

export class InviteBackupDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Adresse email invalide' })
  email!: string;

  @IsIn([2, 3], { message: 'Rang de réserve invalide (2 ou 3)' })
  rank!: number;
}

export class VehicleChoiceDto {
  @IsOptional()
  @IsUUID('4', { message: 'Véhicule invalide' })
  vehicleId?: string;
}

// ── Admin ─────────────────────────────────────────────────────────────

export class AssignDepartureDto {
  @IsUUID('4', { message: 'Chauffeur invalide' })
  driverId!: string;

  @IsUUID('4', { message: 'Véhicule invalide' })
  vehicleId!: string;
}

export class ReviewCancellationDto {
  @IsIn(['counted', 'justified', 'waived'], { message: 'Statut invalide' })
  status!: 'counted' | 'justified' | 'waived';

  @Transform(trim)
  @IsString()
  @MinLength(5, { message: 'Motif : 5 caractères minimum' })
  @MaxLength(500, { message: 'Motif limité à 500 caractères' })
  reason!: string;
}

/** Paiement d'une pénalité reçu hors application (virement bancaire). */
export class PenaltyPaymentDto {
  @IsInt({ message: 'Montant en centimes' })
  @Min(1, { message: 'Montant en centimes' })
  @Max(10_000_000, { message: 'Montant en centimes' })
  amountCents!: number;

  /** Référence du virement (libellé bancaire) : tracée au journal d'audit. */
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Référence du paiement : 3 caractères minimum' })
  @MaxLength(120, { message: 'Référence du paiement limitée à 120 caractères' })
  reference!: string;
}

export class PenaltyDecisionDto {
  @IsIn(['uphold', 'cancel'], { message: 'Décision invalide' })
  decision!: 'uphold' | 'cancel';

  @Transform(trim)
  @IsString()
  @MinLength(5, { message: 'Motif : 5 caractères minimum' })
  @MaxLength(500, { message: 'Motif limité à 500 caractères' })
  reason!: string;
}

/** Plan des sièges sur le trajet du passager (revente en cours de trajet). */
export class SeatMapQueryDto {
  /** Arrêt de montée (absent = départ de la ligne). */
  @IsOptional()
  @IsUUID('4', { message: 'Arrêt invalide' })
  boardStopId?: string;

  /** Arrêt de descente (absent = arrivée de la ligne). */
  @IsOptional()
  @IsUUID('4', { message: 'Arrêt invalide' })
  alightStopId?: string;
}
