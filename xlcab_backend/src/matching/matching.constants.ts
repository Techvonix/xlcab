// Cycle de vie d'une course côté matching. La spec ne fixe que
// "pending" (valeur par défaut, Partie 4) : les autres statuts sont
// proposés ici et partagés avec les modules Trips et Payments.
//
//   awaiting_payment ──paiement──▶ pending   (courses passager prépayées)
//   pending ──match──▶ searching ──accept──▶ accepted ──▶ started ──▶ completed
//      ▲                   │
//      └──── no_driver ◀───┘ (aucun chauffeur n'a accepté)
//
//   awaiting_payment ──paiement──▶ attached  (colis greffé sur une course
//   passager : jamais dispatché, il suit la course qui le transporte)
export const TripStatus = {
  /** Réservation passager créée, paiement Stripe pas encore confirmé. */
  AWAITING_PAYMENT: 'awaiting_payment',
  PENDING: 'pending',
  SEARCHING: 'searching',
  NO_DRIVER: 'no_driver',
  ACCEPTED: 'accepted',
  STARTED: 'started',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  /** Colis greffé sur une course passager (module Colis). */
  ATTACHED: 'attached',
} as const;

/** Statuts depuis lesquels on peut (re)lancer une recherche. */
export const MATCHABLE_STATUSES: string[] = [TripStatus.PENDING, TripStatus.NO_DRIVER];

export const SHUTTLE_TYPES = ['rose', 'bleue', 'orange', 'accessibility'] as const;
export type ShuttleType = (typeof SHUTTLE_TYPES)[number];

export const TRIP_TYPES = ['passenger', 'parcel', 'mixed'] as const;
export type TripType = (typeof TRIP_TYPES)[number];

// ── Courses programmées ─────────────────────────────────────────────────
// Les réservations se font au moins 2 h à l'avance, parfois des jours
// avant. Un chauffeur n'est donc "occupé" que sur le créneau de ses
// courses acceptées, et sa position n'est partagée qu'à l'approche.

/** Statuts où un chauffeur est engagé sur une course. */
export const DRIVER_COMMITTED_STATUSES: string[] = [TripStatus.ACCEPTED, TripStatus.STARTED];

/** Marge entre deux courses d'un même chauffeur (trajet d'approche). */
export const SCHEDULE_BUFFER_MIN = 60;

/** Durée supposée si le devis n'en a pas fourni. */
export const DEFAULT_TRIP_DURATION_MIN = 120;

/** La position du chauffeur est partagée au passager à partir de T − 60 min. */
export const TRACKING_LEAD_MIN = 60;

/** Créneaux [début, fin] qui se chevauchent, marge incluse. */
export function schedulesOverlap(
  aStart: Date,
  aDurationMin: number | null | undefined,
  bStart: Date,
  bDurationMin: number | null | undefined,
): boolean {
  const buffer = SCHEDULE_BUFFER_MIN * 60_000;
  const aEnd = aStart.getTime() + (aDurationMin ?? DEFAULT_TRIP_DURATION_MIN) * 60_000;
  const bEnd = bStart.getTime() + (bDurationMin ?? DEFAULT_TRIP_DURATION_MIN) * 60_000;
  return aStart.getTime() - buffer < bEnd && bStart.getTime() - buffer < aEnd;
}

/**
 * Recherche de chauffeur différée : pour une course programmée, on
 * sollicite les chauffeurs en ligne à partir de T − 3 h (DISPATCH_LEAD_MIN),
 * pas des jours avant. Lu à chaque appel : réglable par variable d'environnement.
 */
export const DEFAULT_DISPATCH_LEAD_MIN = 180;

export function dispatchLeadMin(): number {
  const raw = Number(process.env.DISPATCH_LEAD_MIN);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DISPATCH_LEAD_MIN;
}

/** Heure à partir de laquelle la recherche de chauffeur peut commencer. */
export function dispatchStartAt(scheduledAt: Date | null): Date | null {
  return scheduledAt ? new Date(scheduledAt.getTime() - dispatchLeadMin() * 60_000) : null;
}

/** Sans preneur, nouvelle recherche toutes les 10 min jusqu'au départ. */
export const NO_DRIVER_RETRY_SECONDS = 10 * 60;
export const dispatchRetryKey = (tripId: string) => `dispatch:retry:${tripId}`;

/** Course dans la fenêtre de partage de position (ou sans heure fixée). */
export function withinTrackingLead(scheduledAt: Date | null, now = new Date()): boolean {
  return !scheduledAt || scheduledAt.getTime() <= now.getTime() + TRACKING_LEAD_MIN * 60_000;
}

// ── Clés Redis ──────────────────────────────────────────────────────────
// Partagées avec le Module 3 (Tracking) :
export const DRIVERS_GEO_KEY = 'drivers:online'; // GEO, alimenté par driver:location
export const driverSeenKey = (driverId: string) => `driver:seen:${driverId}`; // TTL 30 s
export const driverTripKey = (driverId: string) => `driver:trip:${driverId}`; // course active

// Propres au dispatch :
/** Offre en cours pour un chauffeur (valeur = tripId). Un chauffeur n'a qu'une offre à la fois. */
export const driverOfferKey = (driverId: string) => `driver:offer:${driverId}`;
/** File ordonnée des candidats restants (JSON { driverId, vehicleId }). */
export const dispatchQueueKey = (tripId: string) => `dispatch:${tripId}:queue`;
