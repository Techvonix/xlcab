import { ADMIN_ROLE, decodeJwt, useAuth } from './auth-store';
import type { AdminAnalytics, AdminTrip, AdminUser, AuditLog, Incident, Jurisdiction, NewTariff, Paged, PendingDriver, Tariff, TariffOverview, AdminInvoicePage, AdminRating, RatedDriver, AdminOperator, AtRiskDeparture, RescueCandidate, AdminCancellation, AdminPenalty, AdminMarketRequest, AdminPayout, PayoutStatus } from './types';
import { lang, t } from '@/lib/i18n';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * Toutes les requêtes : « X-Client: web » (l'API pose alors le refresh token et
 * la preuve 2FA en cookies HttpOnly) et credentials 'include' (cookies envoyés).
 */
// X-Locale : le serveur renvoie ses messages d'erreur dans la langue du dashboard.
const WEB_HEADERS = { 'X-Client': 'web', 'X-Locale': lang } as const;
const WITH_COOKIES = { credentials: 'include' } as const;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

/** Le serveur exige la double authentification (preuve absente ou expirée). */
export const isTwoFactorRequired = (e: unknown) => e instanceof ApiError && e.code === 'TWO_FACTOR_REQUIRED';

async function toApiError(res: Response): Promise<ApiError> {
  let message = t('serviceMomentanementIndisponibleReessayezPlus');
  let code: string | undefined;
  try {
    const body = await res.json();
    code = typeof body?.code === 'string' ? body.code : undefined;
    if (res.status < 500 && typeof body?.message === 'string') message = body.message;
    else if (Array.isArray(body?.message)) message = t('certainesInformationsSontInvalides');
  } catch {
    /* corps non JSON */
  }
  if (res.status === 401) message = t('sessionExpireeOuCodeIncorrect');
  return new ApiError(message, res.status, code);
}

let refreshing: Promise<boolean> | null = null;

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

async function send(path: string, init: { method?: string; body?: unknown }): Promise<Response> {
  const { accessToken } = useAuth.getState();
  return fetch(`${BASE_URL}${path}`, {
    ...WITH_COOKIES,
    method: init.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...WEB_HEADERS,
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

/** Requête authentifiée (jeton ; preuve 2FA en cookie), avec un rafraîchissement sur 401. */
export async function apiRequest(path: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
  let res = await send(path, init);
  if (res.status === 401 && (await refreshSession())) res = await send(path, init);
  if (res.status === 401) useAuth.getState().clear();
  if (!res.ok) {
    const error = await toApiError(res);
    // Preuve 2FA expirée : l'application repasse sur l'écran de code.
    if (error.code === 'TWO_FACTOR_REQUIRED') useAuth.getState().setTwoFactorVerified(false);
    throw error;
  }
  return res;
}

export async function apiJson<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await apiRequest(path, init);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

// ── Authentification ────────────────────────────────────────────────────

export async function login(email: string, password: string) {
  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    ...WITH_COOKIES,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...WEB_HEADERS },
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 401) throw new ApiError(t('emailOuMotDePasse'), 401);
  if (!res.ok) throw await toApiError(res);
  const tokens = await res.json();
  if (decodeJwt(tokens.accessToken).role !== ADMIN_ROLE) {
    throw new ApiError(t('accesReserveALEquipe2'), 403);
  }
  useAuth.getState().setAccessToken(tokens.accessToken);
}

export const restoreSession = () => refreshSession();

export async function logout() {
  try {
    await apiRequest('/api/v1/auth/logout', { method: 'POST' });
  } catch {
    /* déjà expirée */
  } finally {
    useAuth.getState().clear();
  }
}

export const twoFactor = {
  /** proofValid : le cookie de preuve 2FA (illisible ici) est encore valable. */
  status: () => apiJson<{ enabled: boolean; required: boolean; proofValid: boolean }>('/api/v1/auth/2fa/status'),
  setup: () => apiJson<{ otpauthUrl: string; secret: string }>('/api/v1/auth/2fa/setup', { method: 'POST' }),
  async enable(code: string) {
    await apiJson('/api/v1/auth/2fa/enable', { method: 'POST', body: { code } });
    useAuth.getState().setTwoFactorVerified(true);
  },
  async verify(code: string) {
    await apiJson('/api/v1/auth/2fa/verify', { method: 'POST', body: { code } });
    useAuth.getState().setTwoFactorVerified(true);
  },
};

// ── Endpoints admin (Partie 6) ──────────────────────────────────────────

const qs = (params: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  analytics: () => apiJson<AdminAnalytics>('/api/v1/admin/analytics'),
  pendingDrivers: () => apiJson<PendingDriver[]>('/api/v1/admin/drivers/pending'),
  /** Fichier d'un document (jamais d'URL publique) : blob à afficher localement. */
  documentFile: async (driverId: string, docId: string) =>
    (await apiRequest(`/api/v1/admin/drivers/${encodeURIComponent(driverId)}/documents/${encodeURIComponent(docId)}/file`)).blob(),
  reviewDocument: (driverId: string, docId: string, status: 'approved' | 'rejected', reason?: string) =>
    apiJson(`/api/v1/admin/drivers/${encodeURIComponent(driverId)}/documents/${encodeURIComponent(docId)}/review`, {
      method: 'POST',
      body: { status, ...(reason ? { reason } : {}) },
    }),
  approveDriver: (driverId: string, roseEligible: boolean) =>
    apiJson(`/api/v1/admin/drivers/${encodeURIComponent(driverId)}/approve`, { method: 'POST', body: { roseEligible } }),
  rejectDriver: (driverId: string, reason: string) =>
    apiJson(`/api/v1/admin/drivers/${encodeURIComponent(driverId)}/reject`, { method: 'POST', body: { reason } }),
  users: (q: { search?: string; role?: string; page?: number }) => apiJson<Paged<AdminUser>>(`/api/v1/admin/users${qs(q)}`),
  trips: (q: { status?: string; page?: number }) => apiJson<Paged<AdminTrip>>(`/api/v1/admin/trips${qs(q)}`),
  incidents: (q: { status?: string; page?: number }) => apiJson<Paged<Incident>>(`/api/v1/admin/incidents${qs(q)}`),
  acknowledgeIncident: (id: string) => apiJson(`/api/v1/admin/incidents/${encodeURIComponent(id)}/acknowledge`, { method: 'POST' }),
  resolveIncident: (id: string, notes: string) =>
    apiJson(`/api/v1/admin/incidents/${encodeURIComponent(id)}/resolve`, { method: 'POST', body: { notes } }),
  auditLogs: (q: { action?: string; page?: number }) => apiJson<Paged<AuditLog>>(`/api/v1/admin/audit-logs${qs(q)}`),
  ratings: (q: { driverId?: string; maxStars?: number; withComment?: boolean; page?: number }) =>
    apiJson<Paged<AdminRating>>(`/api/v1/admin/ratings${qs({ ...q, withComment: q.withComment ? 'true' : undefined })}`),
  ratedDrivers: (page = 1) => apiJson<Paged<RatedDriver>>(`/api/v1/admin/ratings/drivers${qs({ page })}`),
  removeRating: (id: string, reason: string) =>
    apiJson<{ removed: true; driver: { rating: number; ratingCount: number } }>(`/api/v1/admin/ratings/${encodeURIComponent(id)}`, { method: 'DELETE', body: { reason } }),
  jurisdictions: () => apiJson<Jurisdiction[]>('/api/v1/jurisdictions'),
  updateJurisdiction: (code: string, body: Partial<Jurisdiction>) =>
    apiJson<Jurisdiction>(`/api/v1/admin/jurisdictions/${encodeURIComponent(code)}`, { method: 'PATCH', body }),
  tariffs: (jurisdiction = 'FR') => apiJson<TariffOverview>(`/api/v1/admin/tariffs${qs({ jurisdiction })}`),
  createTariff: (body: NewTariff) => apiJson<Tariff>('/api/v1/admin/tariffs', { method: 'POST', body }),
  invoices: (page = 1) => apiJson<AdminInvoicePage>(`/api/v1/admin/invoices${qs({ page })}`),
  invoicePdf: async (id: string) => (await apiRequest(`/api/v1/invoices/${encodeURIComponent(id)}/pdf`)).blob(),
  cancelTariff: (id: string) => apiJson(`/api/v1/admin/tariffs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  // ── Bourse de transport ──
  operators: (q: { status?: string; page?: number }) => apiJson<Paged<AdminOperator>>(`/api/v1/admin/operators${qs(q)}`),
  reviewOperator: (id: string, body: { status?: AdminOperator['status']; perSeatAllowed?: boolean; reason: string }) =>
    apiJson<AdminOperator>(`/api/v1/admin/operators/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  atRiskDepartures: () => apiJson<AtRiskDeparture[]>('/api/v1/admin/departures/at-risk'),
  rescueCandidates: (departureId: string) => apiJson<RescueCandidate[]>(`/api/v1/admin/departures/${encodeURIComponent(departureId)}/candidates`),
  assignDeparture: (departureId: string, driverId: string, vehicleId: string) =>
    apiJson(`/api/v1/admin/departures/${encodeURIComponent(departureId)}/assign`, { method: 'POST', body: { driverId, vehicleId } }),
  cancellations: (status?: string) => apiJson<AdminCancellation[]>(`/api/v1/admin/cancellations${qs({ status })}`),
  reviewCancellation: (id: string, status: 'counted' | 'justified' | 'waived', reason: string) =>
    apiJson(`/api/v1/admin/cancellations/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status, reason } }),
  penalties: (status?: string) => apiJson<AdminPenalty[]>(`/api/v1/admin/penalties${qs({ status })}`),
  decidePenalty: (id: string, decision: 'uphold' | 'cancel', reason: string) =>
    apiJson(`/api/v1/admin/penalties/${encodeURIComponent(id)}`, { method: 'PATCH', body: { decision, reason } }),
  marketRequests: (q: { status?: string; page?: number }) => apiJson<Paged<AdminMarketRequest>>(`/api/v1/admin/market/requests${qs(q)}`),
  /** Reversements aux opérateurs ; sans statut : ceux qui ne sont pas encore partis. */
  payouts: (status?: string) => apiJson<AdminPayout[]>(`/api/v1/admin/payouts${qs({ status })}`),
  retryPayout: (id: string) => apiJson<{ id: string; status: PayoutStatus }>(`/api/v1/admin/payouts/${encodeURIComponent(id)}/retry`, { method: 'POST' }),
};
