// Dates en heure locale d'un fuseau (sans dépendance : Intl suffit).
// Partagé par le mode chauffeur (revenus du jour / de la semaine) et les
// lignes régulières (départ « 5 h heure de Paris », été comme hiver).

/** Fuseau de chaque juridiction. */
export const TIMEZONES: Record<string, string> = { FR: 'Europe/Paris', IE: 'Europe/Dublin' };

/** Décalage (ms) entre l'heure locale du fuseau et UTC à l'instant donné. */
export function tzOffsetMs(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Instant UTC d'une date ("AAAA-MM-JJ") et d'une heure ("HH:MM") locales. */
export function zonedToUtc(localDate: string, time: string, tz: string): Date {
  const [y, m, d] = localDate.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, min);
  // Deux passes : le décalage dépend de l'instant visé (changement d'heure).
  const guess = new Date(wall - tzOffsetMs(new Date(wall), tz));
  return new Date(wall - tzOffsetMs(guess, tz));
}

/** Date locale "AAAA-MM-JJ" d'un instant. */
export function localDateOf(at: Date, tz: string): string {
  return new Date(at.getTime() + tzOffsetMs(at, tz)).toISOString().slice(0, 10);
}

/** Heure locale "HH:MM" d'un instant. */
export function localTimeOf(at: Date, tz: string): string {
  return new Date(at.getTime() + tzOffsetMs(at, tz)).toISOString().slice(11, 16);
}

/** "AAAA-MM-JJ" + n jours (calendrier, sans fuseau). */
export function addDays(localDate: string, days: number): string {
  const [y, m, d] = localDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Jour de la semaine ISO d'une date : 1 = lundi … 7 = dimanche. */
export function isoWeekday(localDate: string): number {
  const [y, m, d] = localDate.split('-').map(Number);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

/** Minutes depuis minuit d'une heure "HH:MM". */
export const minutesOf = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

/** Début du jour, de la semaine (lundi) ou du mois, à minuit heure locale. */
export function startOf(unit: 'day' | 'week' | 'month', now: Date, tz: string): Date {
  const local = new Date(now.getTime() + tzOffsetMs(now, tz)); // "heure murale" lue en UTC
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  let d = local.getUTCDate();
  if (unit === 'month') d = 1;
  if (unit === 'week') d -= (local.getUTCDay() + 6) % 7; // lundi = 0
  const wallMidnight = Date.UTC(y, m, d);
  // Le décalage à minuit peut différer de celui de maintenant (changement
  // d'heure dans l'intervalle) : on le recalcule à l'instant visé.
  const guess = new Date(wallMidnight - tzOffsetMs(now, tz));
  return new Date(wallMidnight - tzOffsetMs(guess, tz));
}
