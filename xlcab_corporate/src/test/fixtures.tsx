import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Analytics, Invoice, Member } from '@/lib/types';

/** Rendu avec React Query (sans nouvel essai) et routeur en mémoire. */
export function renderWithProviders(ui: ReactElement, { route = '/' } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/** JWT factice (seul le contenu est lu côté client). */
export function fakeJwt(claims: Record<string, unknown>): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64(claims)}.signature`;
}

export const members: Member[] = [
  { id: 'm-admin', role: 'admin', email: 'boss@acme.fr', firstName: 'Alice', lastName: 'Martin', costCenter: null, monthlyLimitCents: null, monthSpendCents: 0, addedAt: '2026-09-01T00:00:00Z' },
  { id: 'm-emp', role: 'member', email: 'emp@acme.fr', firstName: 'Bruno', lastName: 'Petit', costCenter: 'Ventes', monthlyLimitCents: 50000, monthSpendCents: 20310, addedAt: '2026-09-02T00:00:00Z' },
];

export const invoice: Invoice = {
  month: '2026-10',
  company: { name: 'ACME SAS', vatNumber: 'FR12345678901', siret: '12345678900012', billingAddress: '1 rue de Paris, 75001 Paris', billingEmail: 'compta@acme.fr' },
  lines: [
    {
      tripId: 't1', date: '2026-10-02T12:30:00.000Z', status: 'completed', billable: true, passengerName: 'Bruno Petit',
      costCenter: 'Ventes', originAddress: 'Gare de Lyon, Paris', destinationAddress: 'Gare de Rouen', shuttleType: 'orange',
      passengerHtCents: 20310, passengerVatRate: 0, passengerVatCents: 0, parcelHtCents: 800, parcelVatRate: 20, parcelVatCents: 160, totalTtcCents: 21270,
    },
    {
      tripId: 't2', date: '2026-10-20T07:00:00.000Z', status: 'pending', billable: false, passengerName: 'Bruno Petit',
      costCenter: null, originAddress: '=HYPERLINK("http://evil")', destinationAddress: 'Lille; centre', shuttleType: 'bleue',
      passengerHtCents: 9000, passengerVatRate: 0, passengerVatCents: 0, parcelHtCents: 0, parcelVatRate: null, parcelVatCents: 0, totalTtcCents: 9000,
    },
  ],
  totals: { billableTrips: 1, passengerHtCents: 20310, passengerVatCents: 0, parcelHtCents: 800, parcelVatCents: 160, totalTtcCents: 21270 },
};

export const analytics: Analytics = {
  month: '2026-10',
  totals: { trips: 2, spendTtcCents: 30270, spendHtCents: 30110, vatCents: 160, passengerHtCents: 29310, parcelHtCents: 800 },
  budget: { monthlyLimitCents: 100000, usedCents: 30270 },
  byMember: [{ name: 'Bruno Petit', trips: 2, spendTtcCents: 30270 }],
  byCostCenter: [{ costCenter: 'Ventes', spendTtcCents: 21270 }],
  byShuttle: [{ shuttleType: 'orange', trips: 1 }, { shuttleType: 'bleue', trips: 1 }],
  monthly: ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((month, i) => ({
    month, trips: i === 5 ? 2 : 0, spendTtcCents: i === 5 ? 30270 : 0,
  })),
};
