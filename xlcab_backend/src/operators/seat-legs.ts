// Revente des places en cours de trajet (vente à la place) : un siège n'est occupé
// que sur le tronçon réservé. Les points du départ (départ, arrêts, arrivée — voir
// line-stops.ts) découpent le trajet en « tronçons élémentaires » : le tronçon k va du
// point k au point k + 1. Un siège vendu de i à j occupe les tronçons i … j − 1.
// Les sièges vendus (LineSeat) sont la référence : la charge de chaque tronçon en
// découle, et LineDeparture.seatsBooked = la plus forte charge (le plus de passagers
// à bord en même temps). Un voyageur garde le même siège de la montée à la descente.

/** Siège vendu sur un départ : `toIndex` null = jusqu'à l'arrivée (ventes d'avant la revente). */
export interface SeatSpan {
  seatNumber: number;
  fromIndex: number;
  toIndex: number | null;
}

/** Nombre de tronçons élémentaires d'un départ (au moins un). */
export const legCount = (routeLength: number) => Math.max(1, routeLength - 1);

const endOf = (s: SeatSpan, legs: number) => s.toIndex ?? legs;

/** Le siège vendu chevauche-t-il le trajet de `from` à `to` ? (descendre là où l'autre monte ne compte pas) */
export const overlaps = (s: SeatSpan, from: number, to: number, legs: number) => s.fromIndex < to && from < endOf(s, legs);

/** Passagers à bord sur chaque tronçon élémentaire. */
export function legLoads(spans: SeatSpan[], legs: number): number[] {
  const loads = new Array<number>(legs).fill(0);
  for (const s of spans) {
    for (let k = Math.max(0, s.fromIndex); k < Math.min(legs, endOf(s, legs)); k++) loads[k]++;
  }
  return loads;
}

/** Le plus de passagers à bord en même temps (= seatsBooked d'un départ vendu à la place). */
export const peakLoad = (spans: SeatSpan[], legs: number) => Math.max(0, ...legLoads(spans, legs));

/** Numéros des sièges pris sur une partie au moins du trajet de `from` à `to`. */
export function takenSeats(spans: SeatSpan[], from: number, to: number, legs: number): number[] {
  return [...new Set(spans.filter((s) => overlaps(s, from, to, legs)).map((s) => s.seatNumber))].sort((a, b) => a - b);
}

/** Sièges libres de bout en bout sur le trajet de `from` à `to` (on ne change pas de siège en route). */
export const freeOnSegment = (spans: SeatSpan[], seatsTotal: number, from: number, to: number, legs: number) =>
  Math.max(0, seatsTotal - takenSeats(spans, from, to, legs).filter((n) => n <= seatsTotal).length);

/**
 * Sièges attribués à une réservation de `from` à `to` : ceux demandés s'ils sont libres
 * sur tout le trajet ; sinon d'abord les sièges qu'un voyageur quitte à la montée ou
 * prend à la descente (moins de places morcelées), puis les plus petits numéros.
 * `full` : plus assez de sièges libres ; `taken` : un siège demandé est déjà pris.
 */
export function pickSeats(
  spans: SeatSpan[],
  seatsTotal: number,
  count: number,
  from: number,
  to: number,
  legs: number,
  wanted?: number[],
): number[] | 'full' | 'taken' {
  const taken = new Set(takenSeats(spans, from, to, legs));
  if (wanted) return wanted.some((n) => taken.has(n)) ? 'taken' : [...wanted].sort((a, b) => a - b);
  const touches = (n: number) =>
    spans.filter((s) => s.seatNumber === n && (endOf(s, legs) === from || s.fromIndex === to)).length;
  const candidates: number[] = [];
  for (let n = 1; n <= seatsTotal; n++) if (!taken.has(n)) candidates.push(n);
  if (candidates.length < count) return 'full';
  candidates.sort((a, b) => touches(b) - touches(a) || a - b);
  return candidates.slice(0, count).sort((a, b) => a - b);
}
