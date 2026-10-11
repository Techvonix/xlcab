import { Equals, IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Inscription libre (Partie 8 — note de relecture) : seul le rôle
 * "passenger" peut être obtenu par auto-inscription. Le champ "role"
 * n'existe donc plus dans ce DTO : le service impose "passenger".
 *
 * Les autres rôles sont attribués par un processus de demande +
 * validation, jamais choisis par la personne qui s'inscrit :
 *   - driver           → POST /drivers/apply puis validation admin
 *   - corporate_*      → invitation par un compte corporate existant
 *   - admin            → création manuelle / endpoint protégé dédié
 *
 * Avec forbidNonWhitelisted (main.ts), une requête qui envoie encore
 * un champ "role" est rejetée en 400, ce qui rend la tentative visible.
 */
export class SignupDto {
  @IsEmail({}, { message: 'Adresse email invalide' })
  email: string;

  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  @IsNotEmpty()
  password: string;

  /**
   * Partie 8 : "Consentement explicite à l'inscription". La case doit
   * avoir été cochée (jamais pré-cochée côté app).
   */
  @Equals(true, { message: 'Vous devez accepter les conditions générales pour créer un compte' })
  acceptTerms: boolean;

  /** Version des CGU affichée à l'utilisateur (ex. "2026-10-01"). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  termsVersion: string;
}
