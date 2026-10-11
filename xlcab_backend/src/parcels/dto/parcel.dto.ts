import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LatLngDto } from '../../bookings/dto/passenger-quote.dto';
import { PARCEL_MAX_WEIGHT_KG } from '../parcels.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** POST /bookings/parcel/quote (écran 11). */
export class ParcelQuoteDto {
  @ValidateNested()
  @Type(() => LatLngDto)
  pickup!: LatLngDto;

  @ValidateNested()
  @Type(() => LatLngDto)
  delivery!: LatLngDto;

  /** Heure souhaitée d'enlèvement (au moins 2 h à l'avance). */
  @IsISO8601({ strict: true })
  scheduledAt!: string;

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
}

export class CreateParcelDto extends ParcelQuoteDto {
  /** "grafted" : sur une course passager (si disponible) ; "dedicated" : navette dédiée. */
  @IsIn(['grafted', 'dedicated'])
  mode!: 'grafted' | 'dedicated';

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  pickupAddress!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  deliveryAddress!: string;

  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Décrivez le contenu du colis' })
  @MaxLength(200)
  description!: string;

  @IsOptional()
  @IsBoolean()
  isFragile?: boolean;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  recipientName!: string;

  /** Format international ou français (06…, +33…). */
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s.-]/g, '') : value))
  @Matches(/^(\+\d{8,15}|0\d{9})$/, { message: 'Numéro du destinataire invalide' })
  recipientPhone!: string;

  /** L'expéditeur certifie l'absence d'objets interdits (matières dangereuses, animaux, valeurs…). */
  @Equals(true, { message: 'Confirmez que le colis ne contient aucun objet interdit' })
  prohibitedItemsDeclined!: boolean;
}

/** POST /bookings/parcel/:id/pickup : QR présenté par l'expéditeur. */
export class ParcelPickupDto {
  @IsString()
  @MaxLength(64)
  qrCode!: string;
}

/** POST /bookings/parcel/:id/deliver (multipart : code + photo). */
export class ParcelDeliverDto {
  @Matches(/^\d{4}$/, { message: 'Code de remise à 4 chiffres' })
  code!: string;
}

/** POST /bookings/parcel/:id/fail : expéditeur absent, destinataire injoignable… */
export class ParcelFailDto {
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}
