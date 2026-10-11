import { locale } from '@/lib/i18n';
const eur = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' });

export const formatEuros = (cents: number | null | undefined) => (cents == null ? '—' : eur.format(cents / 100));

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(new Date(iso));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Europe/Paris' }).format(new Date(iso));
}

/** Échéance dépassée ou dans moins de 30 jours. */
export function expiryState(iso: string | null | undefined, now = Date.now()): 'expired' | 'soon' | 'ok' | 'missing' {
  if (!iso) return 'missing';
  const t = new Date(iso).getTime();
  if (t <= now) return 'expired';
  if (t - now < 30 * 86400_000) return 'soon';
  return 'ok';
}

export const fullName = (p: { firstName?: string | null; lastName?: string | null; email?: string | null } | null | undefined) =>
  p ? [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email || '—' : '—';
