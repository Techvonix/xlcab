import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Messages WebSocket entrants (Partie 6 — WS /ws/tracking).
// On utilise @IsNumber + bornes plutôt que @IsLatitude, qui accepte
// aussi les chaînes : une position doit toujours être un vrai nombre.

/** subscribe:trip / unsubscribe:trip → { tripId } */
export class TripRefDto {
  @IsUUID()
  tripId!: string;
}

/**
 * driver:location — le driverId n'est PAS dans le message : il est
 * toujours déduit du token côté serveur (un chauffeur ne peut pas
 * publier la position d'un autre).
 */
export class DriverLocationDto {
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  lng!: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(360)
  heading?: number;

  /** Vitesse en km/h. */
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(250)
  speed?: number;
}

/** message → { tripId, text } : chat passager ↔ chauffeur. */
export class ChatMessageDto {
  @IsUUID()
  tripId!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  text!: string;
}

/** sos → { tripId, lat, lng } (l'audio 30 s passera par un upload S3 séparé). */
export class SosDto {
  @IsUUID()
  tripId!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  lng!: number;
}
