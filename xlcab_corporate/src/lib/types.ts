import { t } from '@/lib/i18n';
// Types des réponses du backend (xlcab_backend/src/corporate, bookings).

export type ShuttleType = 'rose' | 'bleue' | 'orange' | 'accessibility';

export const SHUTTLES: { value: ShuttleType; label: string }[] = [
  { value: 'rose', label: t('navetteRoseFemmesFamilles') },
  { value: 'bleue', label: t('navetteBleueSuburbainMixte') },
  { value: 'orange', label: t('navetteOrangeCorporateB2b') },
  { value: 'accessibility', label: t('navetteAccessibilitePmr') },
];

export const shuttleLabel = (t: string) => SHUTTLES.find((s) => s.value === t)?.label.split(' — ')[0] ?? t;

export interface Member {
  id: string;
  role: 'admin' | 'member';
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  costCenter: string | null;
  monthlyLimitCents: number | null;
  monthSpendCents: number;
  addedAt: string;
}

export interface Analytics {
  month: string;
  totals: {
    trips: number;
    spendTtcCents: number;
    spendHtCents: number;
    vatCents: number;
    passengerHtCents: number;
    parcelHtCents: number;
  };
  budget: { monthlyLimitCents: number | null; usedCents: number };
  byMember: { name: string; trips: number; spendTtcCents: number }[];
  byCostCenter: { costCenter: string; spendTtcCents: number }[];
  byShuttle: { shuttleType: string; trips: number }[];
  monthly: { month: string; trips: number; spendTtcCents: number }[];
}

export interface InvoiceLine {
  tripId: string;
  date: string | null;
  status: string;
  billable: boolean;
  passengerName: string;
  costCenter: string | null;
  originAddress: string;
  destinationAddress: string;
  shuttleType: string;
  passengerHtCents: number;
  passengerVatRate: number | null;
  passengerVatCents: number;
  parcelHtCents: number;
  parcelVatRate: number | null;
  parcelVatCents: number;
  totalTtcCents: number;
}

export interface Invoice {
  month: string;
  company: {
    name: string;
    vatNumber: string | null;
    siret: string | null;
    billingAddress: string | null;
    billingEmail: string | null;
  };
  lines: InvoiceLine[];
  totals: {
    billableTrips: number;
    passengerHtCents: number;
    passengerVatCents: number;
    parcelHtCents: number;
    parcelVatCents: number;
    totalTtcCents: number;
  };
}

export interface GeoPlace {
  address: string;
  lat: number;
  lng: number;
}

export interface Quote {
  distanceKm: number;
  durationMin: number;
  priceCents: number;
  vatCents: number;
  totalCents: number;
  currency: string;
  vatLines: { regime: 'passenger' | 'parcel'; baseCents: number; ratePercent: number; vatCents: number }[];
}

export interface CreatedTrip {
  tripId: string;
  status: string;
  scheduledAt: string;
  quote: Quote;
}

/** Facture légale numérotée (GET /corporate/invoices/issued). */
export interface IssuedInvoice {
  id: string;
  number: string;
  kind: 'invoice' | 'credit_note';
  periodStart: string | null;
  periodEnd: string | null;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  currency: string;
  issuedAt: string;
  paymentStatus: 'paid' | 'due';
  dueDate: string | null;
}
