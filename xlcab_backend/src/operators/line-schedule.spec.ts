import { addDays, isoWeekday, localDateOf, localTimeOf, zonedToUtc } from '../common/local-time';
import { LineSchedule, bookable, plannedDepartures, priceFor } from './line-schedule';

// Calendrier des lignes régulières : heures locales (changement d'heure),
// jours d'exploitation, exceptions, retour, capacité vendable.

const PARIS = 'Europe/Paris';

const beauvais: LineSchedule = {
  daysOfWeek: [1, 2, 3, 4, 5], // lundi → vendredi
  startDate: '2026-10-19',
  endDate: null,
  departureTime: '05:00',
  returnTime: null,
  timezone: PARIS,
  seats: 8,
  priceCents: 2500,
  pricingMode: 'per_seat',
};

describe('heure locale', () => {
  it('5 h à Paris = 3 h UTC en été, 4 h UTC en hiver (changement du 25 octobre 2026)', () => {
    expect(zonedToUtc('2026-10-23', '05:00', PARIS).toISOString()).toBe('2026-10-23T03:00:00.000Z');
    expect(zonedToUtc('2026-10-25', '05:00', PARIS).toISOString()).toBe('2026-10-25T04:00:00.000Z');
    expect(zonedToUtc('2026-10-26', '05:00', PARIS).toISOString()).toBe('2026-10-26T04:00:00.000Z');
    // Passage à l'heure d'été (29 mars 2026) : 19 h reste 19 h locale.
    expect(zonedToUtc('2026-03-28', '19:00', PARIS).toISOString()).toBe('2026-03-28T18:00:00.000Z');
    expect(zonedToUtc('2026-03-29', '19:00', PARIS).toISOString()).toBe('2026-03-29T17:00:00.000Z');
  });

  it('date et heure locales d’un instant, jours de la semaine, ajout de jours', () => {
    const at = new Date('2026-10-25T22:30:00Z'); // 23 h 30 à Paris (heure d'hiver)
    expect(localDateOf(at, PARIS)).toBe('2026-10-25');
    expect(localTimeOf(at, PARIS)).toBe('23:30');
    expect(localDateOf(new Date('2026-10-25T23:30:00Z'), PARIS)).toBe('2026-10-26');
    expect(isoWeekday('2026-10-19')).toBe(1); // lundi
    expect(isoWeekday('2026-10-25')).toBe(7); // dimanche
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-02-31', 0)).toBe('2026-03-03'); // date impossible détectée par l'aller-retour
  });
});

describe('départs prévus', () => {
  it('Paris–Beauvais 5 h du lundi au vendredi : pas de départ le week-end, heure UTC exacte de part et d’autre du changement d’heure', () => {
    const deps = plannedDepartures(beauvais, new Map(), '2026-10-19', '2026-10-27');
    expect(deps.map((d) => d.localDate)).toEqual([
      '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27',
    ]);
    expect(deps[4].departureAt.toISOString()).toBe('2026-10-23T03:00:00.000Z');
    expect(deps[5].departureAt.toISOString()).toBe('2026-10-26T04:00:00.000Z');
    expect(deps.every((d) => d.direction === 'outbound' && d.seatsTotal === 8)).toBe(true);
  });

  it('pas de départ avant la date de début ni après la date de fin', () => {
    const deps = plannedDepartures({ ...beauvais, endDate: '2026-10-21' }, new Map(), '2026-10-01', '2026-10-31');
    expect(deps.map((d) => d.localDate)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21']);
  });

  it('exceptions : jour fermé, capacité réduite (jamais augmentée)', () => {
    const exceptions = new Map<string, number | null>([
      ['2026-10-20', null],
      ['2026-10-21', 3],
      ['2026-10-22', 20],
    ]);
    const deps = plannedDepartures(beauvais, exceptions, '2026-10-19', '2026-10-22');
    expect(deps.map((d) => [d.localDate, d.seatsTotal])).toEqual([
      ['2026-10-19', 8],
      ['2026-10-21', 3],
      ['2026-10-22', 8],
    ]);
  });

  it('ligne avec retour : un départ par sens et par jour', () => {
    const orleans: LineSchedule = { ...beauvais, daysOfWeek: [5], departureTime: '19:00', returnTime: '22:30', startDate: '2026-10-23' };
    const deps = plannedDepartures(orleans, new Map(), '2026-10-23', '2026-10-23');
    expect(deps.map((d) => [d.direction, d.departureAt.toISOString()])).toEqual([
      ['outbound', '2026-10-23T17:00:00.000Z'],
      ['return', '2026-10-23T20:30:00.000Z'],
    ]);
  });
});

describe('capacité vendable et prix', () => {
  it('à la place : places restantes', () => {
    const d = { seatsTotal: 8, seatsBooked: 6, pricingMode: 'per_seat', priceCents: 2500 };
    expect(bookable(d, 2)).toBe(true);
    expect(bookable(d, 3)).toBe(false);
    expect(bookable(d, 0)).toBe(false);
    expect(priceFor(d, 2)).toBe(5000);
  });

  it('véhicule privatisé : un seul client, groupe dans la capacité, prix du véhicule', () => {
    const free = { seatsTotal: 13, seatsBooked: 0, pricingMode: 'per_vehicle', priceCents: 39000 };
    expect(bookable(free, 13)).toBe(true);
    expect(bookable(free, 14)).toBe(false);
    expect(bookable({ ...free, seatsBooked: 13 }, 1)).toBe(false);
    expect(priceFor(free, 5)).toBe(39000);
  });
});
