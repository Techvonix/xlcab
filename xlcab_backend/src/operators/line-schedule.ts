import { addDays, isoWeekday, zonedToUtc } from '../common/local-time';

// Calendrier des lignes régulières : quels départs existent entre deux
// dates, à quelle heure UTC, avec combien de places. Fonctions pures,
// sans base : testées à part (changements d'heure, exceptions, fin de ligne).

/** Départs générés à l'avance : l'opérateur confirme sa capacité sur cette fenêtre. */
export const LINE_HORIZON_DAYS = 30;
/** Dernier délai de réservation d'un départ de ligne. */
export const LINE_BOOKING_LEAD_MIN = 60;
/** Lignes actives ou en pause par opérateur. */
export const MAX_LINES_PER_OPERATOR = 20;
export const LINE_STATUSES = ['active', 'paused', 'closed'] as const;
export const PRICING_MODES = ['per_vehicle', 'per_seat'] as const;
export const OPERATOR_KINDS = ['independent', 'vtc_company', 'fleet', 'collective'] as const;
export const OPERATOR_SERVICES = ['airport', 'station', 'intercity', 'group', 'business', 'tourism', 'disposal'] as const;
export const OPERATOR_STATUSES = ['pending', 'verified', 'suspended'] as const;

export type Direction = 'outbound' | 'return';

export interface LineSchedule {
  daysOfWeek: number[];
  startDate: string;
  endDate: string | null;
  departureTime: string;
  returnTime: string | null;
  timezone: string;
  seats: number;
  priceCents: number;
  pricingMode: string;
}

export interface PlannedDeparture {
  direction: Direction;
  localDate: string;
  departureAt: Date;
  seatsTotal: number;
  priceCents: number;
  pricingMode: string;
}

/** Clé unique d'un départ dans une ligne (même contrainte qu'en base). */
export const departureKey = (d: { direction: string; localDate: string }) => `${d.direction}|${d.localDate}`;

/**
 * Départs prévus du jour `from` au jour `to` inclus (dates locales).
 * `exceptions` : date → places (null = pas de départ ce jour-là).
 */
export function plannedDepartures(
  line: LineSchedule,
  exceptions: Map<string, number | null>,
  from: string,
  to: string,
): PlannedDeparture[] {
  const first = from > line.startDate ? from : line.startDate;
  const last = line.endDate && line.endDate < to ? line.endDate : to;
  const out: PlannedDeparture[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) {
    if (!line.daysOfWeek.includes(isoWeekday(day))) continue;
    const exception = exceptions.get(day);
    if (exception === null) continue; // jour fermé
    const seatsTotal = exception === undefined ? line.seats : Math.min(line.seats, exception);
    if (seatsTotal <= 0) continue;
    const base = { localDate: day, seatsTotal, priceCents: line.priceCents, pricingMode: line.pricingMode };
    out.push({ ...base, direction: 'outbound', departureAt: zonedToUtc(day, line.departureTime, line.timezone) });
    if (line.returnTime) {
      out.push({ ...base, direction: 'return', departureAt: zonedToUtc(day, line.returnTime, line.timezone) });
    }
  }
  return out;
}

/** Places encore vendables sur un départ pour une demande de `seats` places. */
export function bookable(d: { seatsTotal: number; seatsBooked: number; pricingMode: string }, seats: number): boolean {
  if (seats < 1) return false;
  // Véhicule privatisé : un seul client, et le véhicule doit suffire au groupe.
  if (d.pricingMode === 'per_vehicle') return d.seatsBooked === 0 && seats <= d.seatsTotal;
  return d.seatsTotal - d.seatsBooked >= seats;
}

/** Prix TTC d'une demande : par place, ou le véhicule entier. */
export const priceFor = (d: { priceCents: number; pricingMode: string }, seats: number) =>
  d.pricingMode === 'per_seat' ? d.priceCents * seats : d.priceCents;

/**
 * Version des conditions générales opérateur (protocole d'annulation,
 * pénalités). Une nouvelle version doit être acceptée avant de publier.
 */
export const DEFAULT_OPERATOR_TERMS_VERSION = '2026-10-09';
export const operatorTermsVersion = () => process.env.OPERATOR_TERMS_VERSION || DEFAULT_OPERATOR_TERMS_VERSION;
