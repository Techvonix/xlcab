import { localDateOf } from '../common/local-time';

// Protocole d'annulation chauffeur sur les lignes régulières
// (PROTOCOLE_ANNULATION_CHAUFFEUR.md, décisions du porteur de projet du
// 2026-10-09). Montants réglables par variable d'environnement.

const amount = (name: string, fallback: number) => {
  const raw = Number(process.env[name]);
  return process.env[name] && Number.isInteger(raw) && raw >= 0 ? raw : fallback;
};

/** Pénalité par annulation abusive, à partir de la 3e sur 12 mois. */
export const penaltyCents = () => amount('LINE_PENALTY_CENTS', 26_000);
/** Part de la pénalité versée au chauffeur qui a repris le départ. */
export const rescueBonusCents = () => amount('LINE_RESCUE_BONUS_CENTS', 16_000);
/** Part de la pénalité répartie en avoirs entre les passagers du départ. */
export const passengerShareCents = () => amount('LINE_PASSENGER_SHARE_CENTS', 10_000);
/** Avoir offert à chaque passager quand aucun secours n'est trouvé (% du prix payé). */
export const FAILED_RESCUE_CREDIT_PERCENT = 20;
export const CREDIT_VALIDITY_DAYS = 365;

/** Pénalité non recouvrée sur les reversements au bout de ce délai : facture du solde. */
export const penaltyInvoiceAfterDays = () => amount('LINE_PENALTY_INVOICE_AFTER_DAYS', 30);
/** Délai de paiement de la facture de pénalité. */
export const PENALTY_INVOICE_DUE_DAYS = 30;

export const PENALTY_FROM_COUNT = 3;
export const PENALTY_WINDOW_DAYS = 365;
export const CONTEST_DAYS = 7;
/** « Dernière minute » : le jour même du départ, ou moins de 12 h avant. */
export const LAST_MINUTE_HOURS = 12;

/** Délais de réponse d'un secours : court quand le départ est proche. */
export const RESCUE_RESPONSE_MIN = 15;
export const RESCUE_RESPONSE_URGENT_MIN = 5;
export const RESCUE_URGENT_WITHIN_MIN = 180;

/** Contrôles avant le départ (minutes avant l'heure de départ). */
export const READY_REMINDER_MIN = 75;
export const READY_DEADLINE_MIN = 60;
export const POSITION_CHECK_MIN = 45;
/** Sans secours à T−30 min : les passagers sont prévenus, remboursés, dédommagés. */
export const RESCUE_DEADLINE_MIN = 30;
/** Opérateurs sollicités au plus en alerte générale. */
export const OPEN_CALL_MAX = 30;

export const RESCUE_STAGES = ['backup2', 'backup3', 'open'] as const;
export type RescueStage = (typeof RESCUE_STAGES)[number];

/** Déclencheurs qui comptent pour la pénalité (une panne de documents relève de la conformité). */
export const COUNTED_TRIGGERS = ['driver_cancel', 'not_ready', 'no_position'];

export function isLastMinute(departureAt: Date, now: Date, timezone: string): boolean {
  if (departureAt.getTime() - now.getTime() < LAST_MINUTE_HOURS * 3600_000) return true;
  return localDateOf(departureAt, timezone) === localDateOf(now, timezone);
}

/** Fin de la fenêtre de réponse d'une offre de reprise. */
export function responseDeadline(departureAt: Date, now: Date): Date {
  const untilDeparture = (departureAt.getTime() - now.getTime()) / 60_000;
  const minutes = untilDeparture < RESCUE_URGENT_WITHIN_MIN ? RESCUE_RESPONSE_URGENT_MIN : RESCUE_RESPONSE_MIN;
  const hardStop = departureAt.getTime() - RESCUE_DEADLINE_MIN * 60_000;
  return new Date(Math.max(now.getTime() + 60_000, Math.min(now.getTime() + minutes * 60_000, hardStop)));
}

/** Répartit un montant en parts entières (le reste aux premières parts). */
export function splitCents(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  return Array.from({ length: parts }, (_, i) => base + (i < total - base * parts ? 1 : 0));
}
