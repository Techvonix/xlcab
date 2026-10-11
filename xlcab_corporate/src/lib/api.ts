import { PORTAL_ROLE, decodeJwt, useAuth } from './auth-store';
import type { Analytics, CreatedTrip, GeoPlace, Invoice, Member, Quote, IssuedInvoice } from './types';
import { lang, t } from '@/lib/i18n';

// URL de l'API : vide en développement (proxy Vite /api → localhost:3000),
// https://api.xlcab.com en production (VITE_API_BASE_URL).
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * Toutes les requêtes : « X-Client: web » (l'API pose alors le refresh token et
 * la preuve 2FA en cookies HttpOnly) et credentials 'include' (cookies envoyés).
 */
// X-Locale : le serveur renvoie ses messages d'erreur dans la langue du portail.
const WEB_HEADERS = { 'X-Client': 'web', 'X-Locale': lang } as const;
const WITH_COOKIES = { credentials: 'include' } as const;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    /** Code métier du serveur (ex. TWO_FACTOR_REQUIRED). */
    public code?: string,
  ) {
    super(message);
  }
}

/** Le serveur exige la double authentification (preuve absente ou expirée). */
export const isTwoFactorRequired = (e: unknown) => e instanceof ApiError && e.code === 'TWO_FACTOR_REQUIRED';

/**
 * Message affichable : les erreurs métier du backend sont rédigées en
 * français ("Plafond mensuel dépassé…") ; les erreurs de validation
 * (tableaux techniques) et les 500 restent génériques.
 */
async function toApiError(res: Response): Promise<ApiError> {
  let message = t('serviceMomentanementIndisponibleReessayezPlus');
  let code: string | undefined;
  if (res.status < 500) {
    try {
      const body = await res.json();
      code = typeof body?.code === 'string' ? body.code : undefined;
      if (typeof body?.message === 'string') message = body.message;
      else if (Array.isArray(body?.message)) message = t('certainesInformationsSontInvalides');
    } catch {
      /* corps non JSON */
    }
  }
  if (res.status === 401) message = t('votreSessionAExpireReconnectez');
  // 403 sans code métier : refus générique ; avec code (code 2FA erroné…) : message du serveur.
  else if (res.status === 403 && !code) message = t('accesRefuse');
  return new ApiError(message, res.status, code);
}

/** Erreur de réponse : une preuve 2FA expirée ramène sur l'écran de code. */
async function failed(res: Response): Promise<ApiError> {
  const error = await toApiError(res);
  if (error.code === 'TWO_FACTOR_REQUIRED') useAuth.getState().setTwoFactorVerified(false);
  return error;
}

/** En-têtes d'authentification : jeton d'accès (la preuve 2FA part dans son cookie). */
function authHeaders(): Record<string, string> {
  const { session } = useAuth.getState();
  return {
    ...WEB_HEADERS,
    ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
  };
}

let refreshing: Promise<boolean> | null = null;

/** Rotation du refresh token (Module 2). Une seule à la fois. */
async function refreshSession(): Promise<boolean> {
  // Le refresh token voyage dans le cookie HttpOnly : corps vide.
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
        ...WITH_COOKIES,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...WEB_HEADERS },
        body: '{}',
      });
      if (!res.ok) return false;
      const tokens = await res.json();
      useAuth.getState().setAccessToken(tokens.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Requête authentifiée ; sur 401, un rafraîchissement puis une nouvelle tentative. */
export async function apiFetch<T>(path: string, init: { method?: string; body?: unknown } = {}, retry = true): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...WITH_COOKIES,
    method: init.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...authHeaders(),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (res.status === 401 && retry && (await refreshSession())) {
    return apiFetch<T>(path, init, false);
  }
  if (res.status === 401) useAuth.getState().clear();
  if (!res.ok) throw await failed(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Fichier binaire authentifié (PDF de facture). */
export async function apiBlob(path: string, retry = true): Promise<Blob> {
  const res = await fetch(`${BASE_URL}${path}`, { ...WITH_COOKIES, headers: authHeaders() });
  if (res.status === 401 && retry && (await refreshSession())) return apiBlob(path, false);
  if (!res.ok) throw await failed(res);
  return res.blob();
}

// ── Authentification ────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    ...WITH_COOKIES,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...WEB_HEADERS },
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 401) throw new ApiError(t('emailOuMotDePasse'), 401);
  if (!res.ok) throw await toApiError(res);
  const tokens = await res.json();
  // Contrôle d'interface uniquement : le serveur refuse de toute façon
  // les appels d'un autre rôle (403).
  if (decodeJwt(tokens.accessToken).role !== PORTAL_ROLE) {
    throw new ApiError(t('cePortailEstReserveAux'), 403);
  }
  useAuth.getState().setAccessToken(tokens.accessToken);
}

/** Recharge la session depuis le cookie de refresh (rechargement de page, nouvel onglet). */
export const restoreSession = () => refreshSession();

export async function logout(): Promise<void> {
  try {
    await apiFetch('/api/v1/auth/logout', { method: 'POST' }, false);
  } catch {
    /* session déjà expirée : on nettoie quand même */
  } finally {
    useAuth.getState().clear();
  }
}

// ── Double authentification (Partie 8 : obligatoire pour corporate_admin) ──

export const twoFactor = {
  /** proofValid : le cookie de preuve 2FA (illisible ici) est encore valable. */
  status: () => apiFetch<{ enabled: boolean; required: boolean; proofValid: boolean }>('/api/v1/auth/2fa/status'),
  setup: () => apiFetch<{ otpauthUrl: string; secret: string }>('/api/v1/auth/2fa/setup', { method: 'POST' }),
  async enable(code: string) {
    await apiFetch('/api/v1/auth/2fa/enable', { method: 'POST', body: { code } });
    useAuth.getState().setTwoFactorVerified(true);
  },
  async verify(code: string) {
    await apiFetch('/api/v1/auth/2fa/verify', { method: 'POST', body: { code } });
    useAuth.getState().setTwoFactorVerified(true);
  },
};

// ── Endpoints corporate (Partie 6) ──────────────────────────────────────

const monthQuery = (month?: string) => (month ? `?month=${encodeURIComponent(month)}` : '');

export const api = {
  analytics: (month?: string) => apiFetch<Analytics>(`/api/v1/corporate/analytics${monthQuery(month)}`),
  invoices: (month?: string) => apiFetch<Invoice>(`/api/v1/corporate/invoices${monthQuery(month)}`),
  issuedInvoices: () => apiFetch<IssuedInvoice[]>('/api/v1/corporate/invoices/issued'),
  invoicePdf: (id: string) => apiBlob(`/api/v1/corporate/invoices/issued/${encodeURIComponent(id)}/pdf`),
  members: () => apiFetch<Member[]>('/api/v1/corporate/members'),
  addMember: (body: { email: string; monthlyLimitCents?: number; costCenter?: string }) =>
    apiFetch<{ id: string }>('/api/v1/corporate/members', { method: 'POST', body }),
  removeMember: (id: string) =>
    apiFetch<{ removed: true }>(`/api/v1/corporate/members/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  geocode: (address: string) => apiFetch<GeoPlace[]>('/api/v1/geocode', { method: 'POST', body: { address } }),
  quote: (body: unknown) => apiFetch<Quote>('/api/v1/bookings/passenger/quote', { method: 'POST', body }),
  book: (body: unknown) => apiFetch<CreatedTrip>('/api/v1/corporate/bookings', { method: 'POST', body }),
};
