import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreatePassengerBookingDto } from '../../bookings/dto/passenger-quote.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

// Plafond mensuel : de 1 € à 1 000 000 €, en centimes.
const MAX_LIMIT_CENTS = 100_000_000;

/**
 * POST /api/v1/corporate/accounts — réservé à l'équipe XLCAB (admin) :
 * la facturation mensuelle engage un crédit, l'ouverture d'un compte
 * B2B est donc validée, pas en libre-service.
 */
export class CreateCorporateAccountDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  companyName!: string;

  /** TVA intracommunautaire, ex. FR12345678901. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s/g, '').toUpperCase() : value))
  @Matches(/^[A-Z]{2}[A-Z0-9]{2,13}$/, { message: 'Numéro de TVA intracommunautaire invalide' })
  vatNumber?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s/g, '') : value))
  @Matches(/^\d{14}$/, { message: 'SIRET : 14 chiffres' })
  siret?: string;

  @Transform(lower)
  @IsEmail()
  billingEmail!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  billingAddress?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  costCenter?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(MAX_LIMIT_CENTS)
  monthlyLimitCents?: number;

  /** Compte XLCAB existant qui administrera l'entreprise. */
  @Transform(lower)
  @IsEmail()
  adminEmail!: string;
}

/** PATCH /corporate/accounts/me — champs modifiables par l'admin corporate. */
export class UpdateCorporateAccountDto {
  @IsOptional()
  @Transform(lower)
  @IsEmail()
  billingEmail?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  billingAddress?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  costCenter?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(MAX_LIMIT_CENTS)
  monthlyLimitCents?: number;
}

/** POST /corporate/members. */
export class AddMemberDto {
  @Transform(lower)
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(MAX_LIMIT_CENTS)
  monthlyLimitCents?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  costCenter?: string;
}

/** POST /corporate/bookings — réservation pour un collaborateur. */
export class CorporateBookingDto {
  @IsUUID()
  memberId!: string;

  @ValidateNested()
  @Type(() => CreatePassengerBookingDto)
  trip!: CreatePassengerBookingDto;

  /** Centre de coût de cette course (sinon celui du collaborateur, puis de l'entreprise). */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  costCenter?: string;
}

/** ?month=2026-10 (analytics, factures). */
export class MonthQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Mois au format AAAA-MM' })
  month?: string;
}
