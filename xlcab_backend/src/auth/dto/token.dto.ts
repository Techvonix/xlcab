import { IsEmail, IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export class RefreshTokenDto {
  /** App mobile. Absent pour un portail web : le jeton est lu dans le cookie HttpOnly. */
  @IsOptional()
  @IsNotEmpty({ message: 'Le refresh token est requis' })
  refreshToken?: string;
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Adresse email invalide' })
  email: string;
}

export class ResetPasswordDto {
  @IsNotEmpty({ message: 'Le token de réinitialisation est requis' })
  token: string;

  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  newPassword: string;
}
