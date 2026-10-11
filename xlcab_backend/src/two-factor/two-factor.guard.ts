import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { TwoFactorService } from './two-factor.service';
import { TWO_FACTOR_COOKIE, readCookie } from '../auth/web-session';

export const TWO_FACTOR_HEADER = 'x-2fa-token';

/** Preuve 2FA : en-tête (app, outils) ou cookie HttpOnly (portails web). */
export function proofFrom(req: any): string | undefined {
  const header = req.headers?.[TWO_FACTOR_HEADER];
  return (Array.isArray(header) ? header[0] : header) ?? readCookie(req, TWO_FACTOR_COOKIE);
}

/**
 * À placer APRÈS JwtAuthGuard :
 *   @UseGuards(JwtAuthGuard, RolesGuard, TwoFactorGuard)
 *
 * Exige une preuve 2FA valide pour l'utilisateur du jeton d'accès. Le
 * code d'erreur TWO_FACTOR_REQUIRED permet au client d'afficher l'écran
 * de saisie du code.
 */
@Injectable()
export class TwoFactorGuard implements CanActivate {
  constructor(private twoFactor: TwoFactorService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const token = proofFrom(req);
    if (!req.user?.sub || !this.twoFactor.isValidProof(token, req.user.sub)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'TWO_FACTOR_REQUIRED',
        message: 'Double authentification requise',
      });
    }
    return true;
  }
}
