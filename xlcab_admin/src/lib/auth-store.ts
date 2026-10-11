import { create } from 'zustand';

// Session admin.
// - Jeton d'accès (15 min) : mémoire uniquement.
// - Jeton de rafraîchissement et preuve 2FA (12 h) : cookies HttpOnly posés
//   par l'API (en-tête « X-Client: web »), illisibles par JavaScript (XSS).
//   L'application ne garde qu'un indicateur non secret : 2FA passée ou non.

export const ADMIN_ROLE = 'admin';

export function decodeJwt(token: string): { sub?: string; role?: string; exp?: number } {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return {};
  }
}

interface AuthState {
  accessToken: string | null;
  userId: string | null;
  role: string | null;
  /** Double authentification passée pour cette session. Pas un secret. */
  twoFactorVerified: boolean;
  setAccessToken: (accessToken: string) => void;
  setTwoFactorVerified: (verified: boolean) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  accessToken: null,
  userId: null,
  role: null,
  twoFactorVerified: false,
  setAccessToken: (accessToken) => {
    const claims = decodeJwt(accessToken);
    set({ accessToken, userId: claims.sub ?? null, role: claims.role ?? null });
  },
  setTwoFactorVerified: (verified) => set({ twoFactorVerified: verified }),
  clear: () => set({ accessToken: null, userId: null, role: null, twoFactorVerified: false }),
}));
