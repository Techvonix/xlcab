import { freeOnSegment, legCount, legLoads, peakLoad, pickSeats, takenSeats, SeatSpan } from './seat-legs';

// Lyon (0) → Clermont (1) → Limoges (2) : deux tronçons élémentaires.
const LEGS = legCount(3);
const seat = (seatNumber: number, fromIndex: number, toIndex: number | null): SeatSpan => ({ seatNumber, fromIndex, toIndex });

describe('revente des places en cours de trajet', () => {
  it('un siège n’est occupé que sur son tronçon ; l’ancienne vente sans fin court jusqu’à l’arrivée', () => {
    expect(legLoads([seat(1, 0, 1), seat(2, 0, null)], LEGS)).toEqual([2, 1]);
    expect(peakLoad([seat(1, 0, 1), seat(1, 1, 2)], LEGS)).toBe(1); // Léa puis Karim sur la même place
    expect(peakLoad([], LEGS)).toBe(0);
    expect(legCount(1)).toBe(1);
  });

  it('descendre là où l’autre monte ne chevauche pas', () => {
    const lea = [seat(4, 0, 1)];
    expect(takenSeats(lea, 1, 2, LEGS)).toEqual([]); // Clermont → Limoges : le siège 4 est libre
    expect(takenSeats(lea, 0, 2, LEGS)).toEqual([4]);
    expect(freeOnSegment(lea, 7, 1, 2, LEGS)).toBe(7);
    expect(freeOnSegment(lea, 7, 0, 2, LEGS)).toBe(6);
  });

  it('places libres = sièges libres de bout en bout (pas de changement de siège en route)', () => {
    // Siège 1 pris jusqu'à Clermont, siège 2 pris depuis Clermont : une place libre sur chaque
    // tronçon, mais aucun siège libre de Lyon à Limoges.
    const spans = [seat(1, 0, 1), seat(2, 1, 2)];
    expect(freeOnSegment(spans, 2, 0, 2, LEGS)).toBe(0);
    expect(pickSeats(spans, 2, 1, 0, 2, LEGS)).toBe('full');
    expect(pickSeats(spans, 2, 1, 1, 2, LEGS)).toEqual([1]);
  });

  it('attribution : d’abord le siège qu’un voyageur quitte à la montée, puis les plus petits numéros', () => {
    const spans = [seat(1, 0, 2), seat(5, 0, 1)];
    expect(pickSeats(spans, 7, 1, 1, 2, LEGS)).toEqual([5]); // le siège de Léa, libéré à Clermont
    expect(pickSeats(spans, 7, 2, 1, 2, LEGS)).toEqual([2, 5]);
    expect(pickSeats(spans, 7, 1, 0, 1, LEGS)).toEqual([2]);
  });

  it('sièges demandés : refusés s’ils sont pris sur une partie du trajet', () => {
    const spans = [seat(3, 1, 2)];
    expect(pickSeats(spans, 7, 1, 0, 1, LEGS, [3])).toEqual([3]); // libre jusqu'à Clermont
    expect(pickSeats(spans, 7, 1, 0, 2, LEGS, [3])).toBe('taken');
    expect(pickSeats(spans, 7, 2, 0, 2, LEGS, [6, 2])).toEqual([2, 6]);
  });
});
