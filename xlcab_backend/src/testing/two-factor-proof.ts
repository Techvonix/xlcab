import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';

// Preuve de double authentification valide pour [userId], signée comme le
// fait TwoFactorService (clé dérivée de JWT_SECRET). Pour les tests des
// routes protégées par TwoFactorGuard ; le parcours d'activation lui-même
// est couvert par admin.integration.spec.ts.
export function mfaProof(jwtSecret: string, userId: string): string {
  const secret = createHash('sha256').update(`${jwtSecret}:xlcab-2fa-proof`).digest('hex');
  return new JwtService().sign({ sub: userId, typ: 'mfa' }, { secret, expiresIn: '12h' });
}
