// Règles du module Colis (Partie 7 écrans 11-12, décisions du porteur de
// projet : colis greffé sur une course passager si possible, sinon course
// dédiée ; preuve de remise = code à 4 chiffres + photo ; 30 kg, 120×80×80 cm).

export const PARCEL_MAX_WEIGHT_KG = 30;
/** Dimensions maximales, triées (la plus grande d'abord) : le colis peut être tourné. */
export const PARCEL_MAX_DIMENSIONS_CM = [120, 80, 80];

/** Capacité réservée aux colis sur une course passager (coffre partagé avec les bagages). */
export const MAX_PARCELS_PER_TRIP = 3;
export const MAX_PARCEL_WEIGHT_PER_TRIP_KG = 60;

/** Enlèvement et livraison à moins de 3 km du départ et de l'arrivée de la course porteuse. */
export const GRAFT_MAX_DETOUR_KM = 3;
/** Une course porteuse peut partir jusqu'à 12 h après l'heure souhaitée. */
export const GRAFT_WINDOW_HOURS = 12;

/**
 * Trajet retour d'une course (B → A) : véhicule vide de passagers, donc plus
 * de place. Départ estimé = départ aller + durée + battement.
 */
export const RETURN_TURNAROUND_MIN = 30;
export const MAX_RETURN_PARCELS = 5;
export const MAX_RETURN_PARCEL_WEIGHT_KG = 100;
/** Au-delà, un colis retour jamais récupéré est annulé et remboursé. */
export const RETURN_PICKUP_DEADLINE_HOURS = 6;

/** Départ estimé du trajet retour. */
export function returnDepartureOf(scheduledAt: Date | null, durationMin: number | null): Date | null {
  if (!scheduledAt) return null;
  return new Date(scheduledAt.getTime() + ((durationMin ?? 120) + RETURN_TURNAROUND_MIN) * 60_000);
}

/** Navette des courses colis dédiées (Partie 1.3 : Bleue, "module colis intégré"). */
export const DEDICATED_PARCEL_SHUTTLE = 'bleue';

/** Codes de remise erronés tolérés avant blocage (contact support). */
export const MAX_DELIVERY_CODE_ATTEMPTS = 5;

export const ParcelStatus = {
  PENDING: 'pending',
  PICKED_UP: 'picked_up',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

/** Colis encore à traiter par le chauffeur. */
export const OPEN_PARCEL_STATUSES: string[] = [ParcelStatus.PENDING, ParcelStatus.PICKED_UP, ParcelStatus.IN_TRANSIT];

/** Distance à vol d'oiseau (km), suffisante pour un écart de quelques km. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Le colis tient-il dans 120×80×80 (dans n'importe quel sens) ? */
export function fitsDimensions(dims: number[]): boolean {
  const sorted = [...dims].sort((a, b) => b - a);
  return sorted.every((d, i) => d <= PARCEL_MAX_DIMENSIONS_CM[i]);
}
