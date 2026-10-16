import { LineStop, MeetingPoint } from '@prisma/client';
import { checkStops, pointIndex, routePoints, segmentFare } from './line-stops';

// Arrêts et prix par tronçon : Lyon → Clermont-Ferrand → Limoges, 30 € la place
// pour le trajet complet, 18 € jusqu'à Clermont (2 h 30 après le départ).

const line = {
  originAddress: 'Lyon Part-Dieu', originLat: 45.76, originLng: 4.86,
  destinationAddress: 'Limoges Bénédictins', destinationLat: 45.84, destinationLng: 1.27,
  durationMin: 270,
};
const clermont = {
  id: 'p-clermont', city: 'Clermont-Ferrand', name: 'Clermont – Gare routière', address: 'Gare routière, Clermont-Ferrand',
  lat: 45.78, lng: 3.08, instructions: 'Quai 4', transit: 'Tram A', jurisdiction: 'FR', active: true,
} as MeetingPoint;
const stops = [{ id: 's1', lineId: 'l1', position: 1, meetingPointId: clermont.id, offsetMin: 150, fareFromOriginCents: 1800 }] as LineStop[];
const catalogue = new Map([[clermont.id, clermont]]);

describe('arrêts et prix par tronçon', () => {
  it('aller : départ, arrêt, arrivée, avec décalages et tarifs cumulés', () => {
    const route = routePoints(line, stops, catalogue, 'outbound', 3000);
    expect(route.map((p) => [p.name, p.offsetMin, p.fareCents])).toEqual([
      ['Lyon Part-Dieu', 0, 0],
      ['Clermont – Gare routière', 150, 1800],
      ['Limoges Bénédictins', 270, 3000],
    ]);
    expect(segmentFare(route, 0, 1)).toBe(1800);
    expect(segmentFare(route, 1, 2)).toBe(1200);
    expect(segmentFare(route, 0, 2)).toBe(3000);
    expect(route[1]).toMatchObject({ stopId: 's1', instructions: 'Quai 4', transit: 'Tram A' });
  });

  it('retour : ordre inversé, même prix pour un même tronçon', () => {
    const route = routePoints(line, stops, catalogue, 'return', 3000);
    expect(route.map((p) => [p.name, p.offsetMin, p.fareCents])).toEqual([
      ['Limoges Bénédictins', 0, 0],
      ['Clermont – Gare routière', 120, 1200],
      ['Lyon Part-Dieu', 270, 3000],
    ]);
    expect(segmentFare(route, 1, 2)).toBe(1800); // Clermont → Lyon = Lyon → Clermont
  });

  it('montée / descente par arrêt ; extrémités par défaut', () => {
    const route = routePoints(line, stops, catalogue, 'outbound', 3000);
    expect(pointIndex(route, undefined, 'board')).toBe(0);
    expect(pointIndex(route, undefined, 'alight')).toBe(2);
    expect(pointIndex(route, 's1', 'board')).toBe(1);
    expect(pointIndex(route, 'inconnu', 'alight')).toBe(-1);
  });

  it('prix du départ baissé après coup : un tarif d’arrêt ne dépasse jamais le prix complet', () => {
    const route = routePoints(line, stops, catalogue, 'outbound', 1500);
    expect(route[1].fareCents).toBe(1500);
    expect(segmentFare(route, 1, 2)).toBe(0);
  });

  describe('contrôle des arrêts saisis', () => {
    const base = { pricingMode: 'per_seat', durationMin: 270, priceCents: 3000, jurisdiction: 'FR' };
    const stop = (offsetMin: number, fareFromOriginCents: number, meetingPointId = clermont.id) => ({ meetingPointId, offsetMin, fareFromOriginCents });

    it('accepte des arrêts cohérents ; aucun arrêt = rien à vérifier', () => {
      expect(() => checkStops([stop(150, 1800)], base, catalogue)).not.toThrow();
      expect(() => checkStops([], { ...base, pricingMode: 'per_vehicle', durationMin: null }, new Map())).not.toThrow();
    });

    it.each([
      ['véhicule privatisé', [stop(150, 1800)], { pricingMode: 'per_vehicle' }],
      ['durée inconnue', [stop(150, 1800)], { durationMin: null }],
      ['heure au-delà de l’arrivée', [stop(270, 1800)], {}],
      ['prix égal au trajet complet', [stop(150, 3000)], {}],
      ['autre pays', [stop(150, 1800)], { jurisdiction: 'BE' }],
    ])('refuse : %s', (_label, input, override) => {
      expect(() => checkStops(input, { ...base, ...override }, catalogue)).toThrow();
    });

    it('refuse un point inconnu, retiré, ou cité deux fois ; des heures ou prix non croissants', () => {
      expect(() => checkStops([stop(150, 1800, 'inconnu')], base, catalogue)).toThrow();
      expect(() => checkStops([stop(150, 1800)], base, new Map([[clermont.id, { ...clermont, active: false }]]))).toThrow();
      expect(() => checkStops([stop(100, 1000), stop(150, 1800)], base, catalogue)).toThrow();
      const vichy = { ...clermont, id: 'p-vichy', name: 'Vichy' };
      const both = new Map([[clermont.id, clermont], [vichy.id, vichy]]);
      expect(() => checkStops([stop(150, 1800), stop(120, 2000, vichy.id)], base, both)).toThrow();
      expect(() => checkStops([stop(100, 1800), stop(150, 1500, vichy.id)], base, both)).toThrow();
      expect(() => checkStops([stop(100, 1000, vichy.id), stop(150, 1800)], base, both)).not.toThrow();
    });
  });
});
