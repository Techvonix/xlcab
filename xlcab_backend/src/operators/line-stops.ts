import { BadRequestException } from '@nestjs/common';
import { LineStop, MeetingPoint, RecurringLine } from '@prisma/client';

// Arrêts d'une ligne et prix par tronçon (CLARIFICATION_MODELE.md, D6 et D7).
// Fonctions pures, sans base. Un trajet = départ de la ligne, arrêts
// intermédiaires (points du catalogue), arrivée. Chaque point porte :
// - son décalage en minutes depuis l'heure de départ du sens parcouru ;
// - son tarif cumulé par place depuis le premier point du sens parcouru.
// Le prix d'un tronçon est la différence des tarifs de ses extrémités ; au
// retour, l'ordre s'inverse (décalage = durée − décalage aller, tarif = prix −
// tarif aller), si bien qu'un tronçon coûte la même chose dans les deux sens.

export const MAX_STOPS = 8;

/** Arrêt saisi par le chauffeur. */
export interface StopInput {
  meetingPointId: string;
  offsetMin: number;
  fareFromOriginCents: number;
}

/** Point du trajet, dans le sens parcouru. */
export interface RoutePoint {
  /** null = départ ou arrivée de la ligne. */
  stopId: string | null;
  meetingPointId: string | null;
  name: string;
  address: string;
  lat: number;
  lng: number;
  offsetMin: number;
  fareCents: number;
  instructions: string | null;
  transit: string | null;
}

type LineRoute = Pick<
  RecurringLine,
  'originAddress' | 'originLat' | 'originLng' | 'destinationAddress' | 'destinationLat' | 'destinationLng' | 'durationMin'
>;

/**
 * Points du trajet dans le sens [direction]. [priceCents] = prix par place du
 * trajet complet (celui du départ, figé dès la 1re réservation).
 */
export function routePoints(
  line: LineRoute,
  stops: LineStop[],
  points: Map<string, MeetingPoint>,
  direction: string,
  priceCents: number,
): RoutePoint[] {
  const duration = line.durationMin ?? 0;
  const origin: RoutePoint = {
    stopId: null, meetingPointId: null, name: line.originAddress, address: line.originAddress, lat: line.originLat, lng: line.originLng,
    offsetMin: 0, fareCents: 0, instructions: null, transit: null,
  };
  const destination: RoutePoint = {
    stopId: null, meetingPointId: null, name: line.destinationAddress, address: line.destinationAddress,
    lat: line.destinationLat, lng: line.destinationLng, offsetMin: duration, fareCents: priceCents, instructions: null, transit: null,
  };
  const middle: RoutePoint[] = [...stops]
    .sort((a, b) => a.position - b.position)
    .flatMap((s) => {
      const p = points.get(s.meetingPointId);
      if (!p) return [];
      return [{
        stopId: s.id, meetingPointId: p.id, name: p.name, address: p.address, lat: p.lat, lng: p.lng,
        // Jamais au-delà du prix complet (prix du départ baissé après coup).
        offsetMin: s.offsetMin, fareCents: Math.min(s.fareFromOriginCents, priceCents), instructions: p.instructions ?? null, transit: p.transit ?? null,
      }];
    });
  const outbound = [origin, ...middle, destination];
  if (direction !== 'return') return outbound;
  return outbound.reverse().map((p) => ({ ...p, offsetMin: duration - p.offsetMin, fareCents: priceCents - p.fareCents }));
}

/** Prix par place du tronçon [from] → [to] (indices dans les points du sens parcouru). */
export const segmentFare = (route: RoutePoint[], from: number, to: number) => Math.max(0, route[to].fareCents - route[from].fareCents);

/** Index d'un point par son arrêt (null = départ / arrivée selon [end]). */
export function pointIndex(route: RoutePoint[], stopId: string | null | undefined, end: 'board' | 'alight'): number {
  if (!stopId) return end === 'board' ? 0 : route.length - 1;
  return route.findIndex((p) => p.stopId === stopId);
}

/**
 * Contrôle des arrêts saisis : vente à la place, durée connue, au plus 8
 * arrêts distincts du catalogue (actifs, même pays), décalages croissants
 * strictement compris dans la durée, tarifs croissants strictement compris
 * entre 0 et le prix du trajet complet.
 */
export function checkStops(
  stops: StopInput[],
  line: { pricingMode: string; durationMin: number | null; priceCents: number; jurisdiction: string },
  catalogue: Map<string, MeetingPoint>,
) {
  if (stops.length === 0) return;
  if (line.pricingMode !== 'per_seat') throw new BadRequestException('Les arrêts ne s’appliquent qu’à la vente à la place');
  if (!line.durationMin) throw new BadRequestException('Indiquez la durée du trajet pour placer des arrêts');
  if (stops.length > MAX_STOPS) throw new BadRequestException(`${MAX_STOPS} arrêts au maximum`);
  if (new Set(stops.map((s) => s.meetingPointId)).size !== stops.length) throw new BadRequestException('Un même arrêt ne peut figurer qu’une fois');
  let lastOffset = 0;
  let lastFare = 0;
  for (const s of stops) {
    const p = catalogue.get(s.meetingPointId);
    if (!p || !p.active || p.jurisdiction !== line.jurisdiction) throw new BadRequestException('Point de rencontre inconnu ou retiré du catalogue');
    if (s.offsetMin <= lastOffset || s.offsetMin >= line.durationMin) {
      throw new BadRequestException('Heures de passage : croissantes, entre le départ et l’arrivée');
    }
    if (s.fareFromOriginCents <= lastFare || s.fareFromOriginCents >= line.priceCents) {
      throw new BadRequestException('Prix depuis le départ : croissants, inférieurs au prix du trajet complet');
    }
    lastOffset = s.offsetMin;
    lastFare = s.fareFromOriginCents;
  }
}

/** Vue d'un point pour les applis (consignes d'accès comprises). */
export const pointView = (p: RoutePoint, departureAt: Date) => ({
  stopId: p.stopId,
  meetingPointId: p.meetingPointId,
  name: p.name,
  address: p.address,
  at: new Date(departureAt.getTime() + p.offsetMin * 60_000),
  instructions: p.instructions,
  transit: p.transit,
});
