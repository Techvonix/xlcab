import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Incident, PendingDriver } from '@/lib/types';

export function renderWithProviders(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

export function fakeJwt(claims: Record<string, unknown>): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`;
}

const future = new Date(Date.now() + 400 * 86400_000).toISOString();
const REQUIRED = ['vehicle_registration', 'vehicle_insurance', 'technical_control', 'driving_license', 'vtc_card'];

export function pendingDriver(status: 'pending' | 'approved' = 'pending'): PendingDriver {
  return {
    driverId: 'd1',
    user: { email: 'nadia@x.fr', firstName: 'Nadia', lastName: 'Benali', phone: '+33612345678', jurisdiction: 'FR', createdAt: '2026-09-01T00:00:00Z' },
    profile: {
      licenseNumber: '12AB', licenseExpiry: future, vtcCardNumber: 'VTC1', vtcCardExpiry: future, revtcNumber: null,
      pmrTrained: false, languages: ['fr', 'en'], preferredShuttle: 'rose',
    },
    vehicle: {
      brand: 'Renault', model: 'Trafic', color: 'Gris', plate: 'AB-123-CD', capacity: 8, shuttleType: 'rose',
      pmrEquipped: false, dashcamActive: true, insuranceExpiry: future, technicalControlExpiry: new Date(Date.now() - 86400_000).toISOString(),
    },
    documents: REQUIRED.map((type, i) => ({ id: `doc-${i}`, type, status, mimeType: 'image/jpeg', sizeBytes: 1000, uploadedAt: '2026-09-02T10:00:00Z' })),
    requiredDocuments: REQUIRED,
  };
}

export const incident: Incident = {
  id: 'inc-1', type: 'sos', tripId: 'trip-1', role: 'passenger', lat: 48.85, lng: 2.35, status: 'open', notes: null,
  createdAt: '2026-10-01T10:00:00Z', reporter: { firstName: 'Léa', lastName: 'Roux', email: 'lea@x.fr', phone: '+33600000001' },
};
