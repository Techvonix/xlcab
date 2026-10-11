import { IsNotEmpty, IsPhoneNumber, Length } from 'class-validator';

export class SendOtpDto {
  @IsPhoneNumber(undefined, { message: 'Numéro de téléphone invalide' })
  phone: string;
}

export class VerifyOtpDto {
  @IsPhoneNumber(undefined, { message: 'Numéro de téléphone invalide' })
  phone: string;

  @Length(6, 6, { message: 'Le code doit contenir 6 chiffres' })
  @IsNotEmpty()
  code: string;
}
