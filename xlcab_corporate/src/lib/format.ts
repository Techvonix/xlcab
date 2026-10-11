import { locale, t } from '@/lib/i18n';
const eur = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' });

/** 12150 → "121,50 €" (format de la langue du portail). */
export const formatEuros = (cents: number) => eur.format(cents / 100);

/** 12150 → "121,50" (colonnes numériques des exports). */
export const formatAmount = (cents: number) =>
  (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

/** "2026-10" → "octobre 2026". */
export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

/**
 * Mois précédé de « de » en français, élidé devant une voyelle : « de juin »,
 * « d’octobre ». En anglais, le mois seul (« for October » est dans la phrase).
 */
export function ofMonth(month: string): string {
  const label = formatMonth(month);
  if (locale !== 'fr-FR') return label;
  return /^[aeiouyéèêàâîïôûh]/i.test(label) ? `d’${label}` : `de ${label}`;
}

/** "2026-10" → "oct." (axes des graphiques). */
export function shortMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** Date ISO → "01/10/2026 14:30" (heure de Paris). */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(new Date(iso));
}

/** Mois courant "AAAA-MM". */
export function currentMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Nom affichable d'un membre. */
export function fullName(p: { firstName: string | null; lastName: string | null; email: string | null }): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email || t('collaborateur');
}

export const statusLabel = (s: string) =>
  ({
    pending: t('enAttente'),
    searching: t('rechercheChauffeur'),
    no_driver: t('sansChauffeur'),
    accepted: t('confirmee'),
    started: t('enCours'),
    completed: t('terminee'),
    cancelled: t('annulee'),
  })[s] ?? s;
