import { create } from 'zustand';

// Session du portail.
// - Jeton d'accès (15 min) : en mémoire uniquement.
// - Jeton de rafraîchissement et preuve de double authentification (12 h) :
//   cookies HttpOnly posés par l'API (en-tête « X-Client: web »), illisibles
//   par JavaScript — un script injecté (XSS) ne peut pas les voler. Le
//   portail ne garde qu'un indicateur non secret : 2FA passée ou non.

export interface Session {
  accessToken: string;
  userId: string;
  role: string;
}

interface AuthState {
  session: Session | null;
  /** Double authentification passée pour cette session (Partie 8). Pas un secret. */
  twoFactorVerified: boolean;
  setAccessToken: (accessToken: string) => void;
  setTwoFactorVerified: (verified: boolean) => void;
  clear: () => void;
}

/** Lit le contenu d'un JWT (sans le vérifier : c'est le rôle du serveur). */
export function decodeJwt(token: string): { sub?: string; role?: string; exp?: number } {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export const useAuth = create<AuthState>((set) => ({
  session: null,
  twoFactorVerified: false,
  setAccessToken: (accessToken) => {
    const claims = decodeJwt(accessToken);
    set({ session: { accessToken, userId: claims.sub ?? '', role: claims.role ?? '' } });
  },
  setTwoFactorVerified: (verified) => set({ twoFactorVerified: verified }),
  clear: () => set({ session: null, twoFactorVerified: false }),
}));

/** Seul rôle admis sur ce portail (le serveur le revérifie à chaque appel). */
export const PORTAL_ROLE = 'corporate_admin';
