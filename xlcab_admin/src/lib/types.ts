import { t } from '@/lib/i18n';
// Réponses du backend (xlcab_backend/src/admin, two-factor).

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminAnalytics {
  periodDays: number;
  usersByRole: { role: string; count: number }[];
  pendingDrivers: number;
  tripsByStatus: { status: string; count: number }[];
  openIncidents: number;
  completedTrips: number;
  revenue: { ttcCents: number; passengerHtCents: number; parcelHtCents: number; vatCents: number };
}

export interface DriverDocument {
  id: string;
  type: string;
  status: 'pending' | 'approved' | 'rejected';
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface PendingDriver {
  driverId: string;
  user?: { email: string; firstName: string | null; lastName: string | null; phone: string | null; jurisdiction: string; createdAt: string };
  profile: {
    licenseNumber: string | null;
    licenseExpiry: string | null;
    vtcCardNumber: string | null;
    vtcCardExpiry: string | null;
    revtcNumber: string | null;
    pmrTrained: boolean;
    languages: string[];
    preferredShuttle: string | null;
  };
  vehicle: {
    brand: string | null;
    model: string | null;
    color: string | null;
    plate: string;
    capacity: number;
    shuttleType: string;
    pmrEquipped: boolean;
    dashcamActive: boolean;
    insuranceExpiry: string | null;
    technicalControlExpiry: string | null;
  } | null;
  documents: DriverDocument[];
  requiredDocuments: string[];
}

export interface AdminUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: string;
  jurisdiction: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface AdminTrip {
  id: string;
  status: string;
  type: string;
  shuttleType: string;
  originAddress: string;
  destinationAddress: string;
  scheduledAt: string | null;
  totalPriceCents: number | null;
  passengerName: string | null;
  driverName: string | null;
  corporateId: string | null;
}

export interface Incident {
  id: string;
  type: string;
  tripId: string;
  role: string;
  lat: number;
  lng: number;
  status: 'open' | 'acknowledged' | 'resolved';
  notes: string | null;
  createdAt: string;
  reporter: { firstName: string | null; lastName: string | null; email: string; phone: string | null } | null;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: string;
}

export interface Jurisdiction {
  code: string;
  name: string;
  vatPassengerRate: string | number;
  vatParcelRate: string | number;
  requiresRevtc: boolean;
  requiresVtcCard: boolean;
  minTripKm: number;
  financialGuaranteePerVehicleCents: number | null;
  currency: string;
  leadDpa: string | null;
}

export const DOCUMENT_LABELS: Record<string, string> = {
  vehicle_registration: t('carteGrise'),
  vehicle_insurance: t('attestationDAssurance'),
  technical_control: t('controleTechnique'),
  driving_license: t('permisDeConduire'),
  vtc_card: t('carteVtc'),
  revtc_proof: t('justificatifRevtc'),
};

export const ROLE_LABELS: Record<string, string> = {
  passenger: t('passager'),
  driver: t('chauffeur'),
  corporate_admin: t('adminEntreprise'),
  corporate_member: t('collaborateur'),
  admin: t('adminXlcab'),
};

export const STATUS_LABELS: Record<string, string> = {
  awaiting_payment: t('paiementEnAttente'),
  pending: t('enAttente'),
  searching: t('rechercheChauffeur'),
  no_driver: t('sansChauffeur'),
  accepted: t('confirmee'),
  started: t('enCours'),
  completed: t('terminee'),
  cancelled: t('annulee'),
  attached: t('colisSurNavette'),
};

export const SHUTTLE_LABELS: Record<string, string> = {
  rose: t('rose'),
  bleue: t('bleue'),
  orange: t('orange'),
  accessibility: t('accessibilite'),
};

/** Grille tarifaire (centimes HT) — xlcab_backend/src/admin/tariffs.*. */
export type ShuttleKey = 'rose' | 'bleue' | 'orange' | 'accessibility';

export interface TariffValues {
  ratesPerKm: Record<ShuttleKey, number>;
  childSeatCents: number;
  wifiCents: number;
  extraLuggageCents: number;
  parcelFeeCents: number;
  sharedParcelCents: number;
}

export interface Tariff extends TariffValues {
  id: string | null;
  jurisdiction?: string;
  effectiveFrom: string | null;
  reason: string;
  createdBy: string | null;
  createdAt?: string;
}

export interface TariffOverview {
  jurisdiction: string;
  current: Tariff;
  scheduled: Tariff[];
  history: Tariff[];
  defaults: TariffValues;
}

export interface NewTariff extends TariffValues {
  jurisdiction: string;
  effectiveFrom?: string;
  reason: string;
  confirmLargeChange?: boolean;
}

/** Facture émise (GET /admin/invoices). */
export interface AdminInvoice {
  id: string;
  number: string;
  kind: 'invoice' | 'credit_note';
  corporateId: string | null;
  customerUserId: string | null;
  buyer: { name: string; lines: string[] };
  totalCents: number;
  vatCents: number;
  issuedAt: string;
  paymentStatus: 'paid' | 'due';
  dueDate: string | null;
}

export interface AdminInvoicePage {
  items: AdminInvoice[];
  total: number;
  page: number;
  pageSize: number;
  /** false : mentions légales du vendeur incomplètes (variables INVOICE_SELLER_*). */
  sellerComplete: boolean;
}

/** GET /admin/ratings : note d'un passager (commentaire réservé à l'équipe). */
export interface AdminRating {
  id: string;
  tripId: string;
  stars: number;
  comment: string | null;
  /** Étiquettes rapides choisies par le passager (codes). */
  tags?: string[];
  createdAt: string;
  driver: { id: string; name: string | null };
  passenger: { id: string; name: string | null };
}

// ── Bourse de transport ───────────────────────────────────────────────

/** GET /admin/operators : opérateur de la bourse (vérification, vente à la place). */
export interface AdminOperator {
  id: string;
  kind: string;
  legalName: string | null;
  siret: string | null;
  transportLicense: string | null;
  cities: string[];
  status: 'pending' | 'verified' | 'suspended';
  perSeatAllowed: boolean;
  name: string | null;
  email: string | null;
  driverApproved: boolean;
  openLines: number;
}

/** GET /admin/departures/at-risk : départ de ligne dont le chauffeur a fait défaut. */
export interface AtRiskDeparture {
  departureId: string;
  departureAt: string;
  rescueStatus: 'searching' | 'failed';
  rescueStage: string | null;
  failedDriverName: string | null;
  origin: string | null;
  destination: string | null;
  passengers: number;
  offers: { driverId: string; name: string | null; stage: string; status: string; expiresAt: string }[];
}

/** GET /admin/departures/:id/candidates : chauffeur pouvant reprendre le départ. */
export interface RescueCandidate {
  driverId: string;
  name: string | null;
  phone: string | null;
  vehicleId: string;
  vehicle: string | null;
  capacity: number | null;
}

export interface AdminCancellation {
  id: string;
  driverId: string;
  driverName: string | null;
  trigger: string;
  reason: string | null;
  minutesBefore: number;
  lastMinute: boolean;
  status: 'counted' | 'not_counted' | 'justification_pending' | 'justified' | 'waived';
  justification: string | null;
  createdAt: string;
}

export interface AdminPenalty {
  id: string;
  driverId: string;
  driverName: string | null;
  amountCents: number;
  status: 'pending' | 'contested' | 'applied' | 'cancelled';
  contestUntil: string;
  contestReason: string | null;
  /** Part déjà retenue sur les reversements du chauffeur. */
  collectedCents?: number;
  createdAt: string;
}

export type PayoutStatus = 'draft' | 'pending' | 'paid' | 'blocked' | 'failed' | 'withheld' | 'void';

/** GET /admin/payouts/bonuses : bonus de reprise d'un chauffeur de secours. */
export interface AdminBonus {
  id: string;
  driverId: string;
  driverName: string | null;
  departureId: string;
  amountCents: number;
  status: 'pending' | 'paid' | 'blocked' | 'failed';
  attempts: number;
  lastError: string | null;
  createdAt: string;
  paidAt: string | null;
  /** Recouvré sur la pénalité qui finance ce bonus. */
  penaltyCollectedCents: number;
  penaltyCents: number;
  needsAttention: boolean;
}

/** GET /admin/payouts : reversement dû à un opérateur pour une course terminée. */
export interface AdminPayout {
  id: string;
  tripId: string;
  driverId: string;
  driverName: string | null;
  driverEmail: string | null;
  /** Viré : revenu − retenue. */
  amountCents: number;
  grossCents: number;
  withheldCents: number;
  status: PayoutStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  paidAt: string | null;
  /** Dix essais échoués : plus de reprise automatique. */
  needsAttention: boolean;
}

/** GET /admin/market/requests : demande de transport publiée sur la bourse. */
export interface AdminMarketRequest {
  id: string;
  status: string;
  originAddress: string;
  destinationAddress: string;
  departureAt: string;
  passengers: number;
  requesterEmail: string | null;
  offers: number;
  needsAttention: boolean;
}

/** GET /admin/ratings/drivers : chauffeurs notés, moyenne la plus basse d'abord. */
export interface RatedDriver {
  driverId: string;
  name: string | null;
  rating: number;
  ratingCount: number;
  totalTrips: number;
  lowCount: number;
}
