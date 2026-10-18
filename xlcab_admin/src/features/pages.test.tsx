import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { incident, pendingDriver, renderWithProviders } from '@/test/fixtures';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      analytics: vi.fn(), pendingDrivers: vi.fn(), documentFile: vi.fn(), reviewDocument: vi.fn(),
      approveDriver: vi.fn(), rejectDriver: vi.fn(), users: vi.fn(), trips: vi.fn(), incidents: vi.fn(),
      acknowledgeIncident: vi.fn(), resolveIncident: vi.fn(), requestFootage: vi.fn(), auditLogs: vi.fn(), jurisdictions: vi.fn(), updateJurisdiction: vi.fn(),
      tariffs: vi.fn(), createTariff: vi.fn(), cancelTariff: vi.fn(), invoices: vi.fn(), invoicePdf: vi.fn(),
      ratings: vi.fn(), ratedDrivers: vi.fn(), removeRating: vi.fn(),
    },
    twoFactor: { status: vi.fn(), setup: vi.fn(), enable: vi.fn(), verify: vi.fn() },
  };
});

// WebSocket simulé : le test déclenche lui-même les événements.
const handlers = new Map<string, (payload: unknown) => void>();
const fakeSocket = {
  on: vi.fn((event: string, fn: (p: unknown) => void) => handlers.set(event, fn)),
  off: vi.fn((event: string) => handlers.delete(event)),
  emit: vi.fn(),
};
vi.mock('@/lib/live', () => ({ liveSocket: () => fakeSocket, closeLiveSocket: vi.fn() }));

const { api, twoFactor, ApiError } = await import('@/lib/api');
const { DriversPage } = await import('./drivers/DriversPage');
const { IncidentsPage } = await import('./incidents/IncidentsPage');
const { JurisdictionsPage } = await import('./jurisdictions/JurisdictionsPage');
const { TariffsPage } = await import('./tariffs/TariffsPage');
const { InvoicesPage } = await import('./invoices/InvoicesPage');
const { TwoFactorGate } = await import('./auth/TwoFactorGate');
const { TripsPage } = await import('./trips/TripsPage');
const { RatingsPage } = await import('./ratings/RatingsPage');
const { AdminLayout } = await import('@/components/AdminLayout');

const m = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
const tf = twoFactor as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
});

describe('Double authentification', () => {
  it('premier accès : QR code, clé manuelle, puis confirmation par code', async () => {
    tf.status.mockResolvedValue({ enabled: false, required: true });
    tf.setup.mockResolvedValue({ otpauthUrl: 'otpauth://totp/XLCAB:ops?secret=GEZDGNBVGY3TQOJQ&issuer=XLCAB', secret: 'GEZDGNBVGY3TQOJQ' });
    tf.enable.mockResolvedValue(undefined);
    renderWithProviders(<TwoFactorGate />);

    await userEvent.click(await screen.findByRole('button', { name: 'Activer la double authentification' }));
    expect(await screen.findByAltText('QR code d’activation de la double authentification')).toBeInTheDocument();
    expect(screen.getByText('GEZD GNBV GY3T QOJQ')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Code de confirmation'), '12a3456');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer l’activation' }));
    await waitFor(() => expect(tf.enable).toHaveBeenCalledWith('123456')); // chiffres uniquement
  });

  it('connexion suivante : code refusé → message, champ vidé', async () => {
    tf.status.mockResolvedValue({ enabled: true, required: true });
    // Le serveur répond 403 (pas 401, qui déconnecterait l'administrateur).
    tf.verify.mockRejectedValue(new ApiError('Code incorrect ou expiré', 403, 'INVALID_TWO_FACTOR_CODE'));
    const { container } = renderWithProviders(<TwoFactorGate />);

    const input = await screen.findByLabelText('Code à 6 chiffres');
    await userEvent.type(input, '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(await screen.findByText('Code incorrect ou expiré')).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Validation des chauffeurs', () => {
  const openDossier = async () => {
    await userEvent.click(await screen.findByRole('button', { name: /Nadia Benali/ }));
    return screen.getByRole('region', { name: 'Dossier de Nadia Benali' });
  };

  it('dossier : échéances dépassées signalées en toutes lettres', async () => {
    m.pendingDrivers.mockResolvedValue([pendingDriver()]);
    renderWithProviders(<DriversPage />);
    const dossier = await openDossier();
    expect(within(dossier).getByText('AB-123-CD')).toBeInTheDocument();
    expect(within(dossier).getByText('(EXPIRÉ)')).toBeInTheDocument(); // contrôle technique
  });

  it('"Valider" bloqué tant que les documents ne sont pas tous approuvés', async () => {
    m.pendingDrivers.mockResolvedValue([pendingDriver('pending')]);
    renderWithProviders(<DriversPage />);
    const dossier = await openDossier();
    expect(within(dossier).getByRole('button', { name: 'Valider le chauffeur' })).toBeDisabled();
    expect(within(dossier).getByText('Approuvez d’abord tous les documents obligatoires.')).toBeInTheDocument();
  });

  it('consultation d’un document : image affichée depuis un blob local', async () => {
    m.pendingDrivers.mockResolvedValue([pendingDriver()]);
    m.documentFile.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
    URL.createObjectURL = vi.fn(() => 'blob:local-1');
    URL.revokeObjectURL = vi.fn();
    renderWithProviders(<DriversPage />);
    await openDossier();

    await userEvent.click(screen.getByRole('button', { name: 'Voir : Permis de conduire' }));
    expect(m.documentFile).toHaveBeenCalledWith('d1', 'doc-3');
    expect(await screen.findByAltText('Permis de conduire du candidat')).toHaveAttribute('src', 'blob:local-1');
  });

  it('refus d’un document : motif obligatoire', async () => {
    m.pendingDrivers.mockResolvedValue([pendingDriver()]);
    m.reviewDocument.mockResolvedValue({});
    renderWithProviders(<DriversPage />);
    await openDossier();

    await userEvent.click(screen.getByRole('button', { name: 'Refuser : Carte VTC' }));
    const confirm = screen.getByRole('button', { name: 'Confirmer le refus' });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Motif (communiqué au candidat)'), 'Carte illisible');
    await userEvent.click(confirm);
    await waitFor(() => expect(m.reviewDocument).toHaveBeenCalledWith('d1', 'doc-4', 'rejected', 'Carte illisible'));
  });

  it('documents approuvés : validation avec habilitation Navette Rose', async () => {
    m.pendingDrivers.mockResolvedValue([pendingDriver('approved')]);
    m.approveDriver.mockResolvedValue({});
    renderWithProviders(<DriversPage />);
    const dossier = await openDossier();

    await userEvent.click(within(dossier).getByLabelText(/Habiliter pour la Navette Rose/));
    await userEvent.click(within(dossier).getByRole('button', { name: 'Valider le chauffeur' }));
    await waitFor(() => expect(m.approveDriver).toHaveBeenCalledWith('d1', true));
    expect(await screen.findByText('Nadia Benali est validé(e) comme chauffeur.')).toBeInTheDocument();
  });

  it('refus du dossier : motif de 10 caractères minimum', async () => {
    m.pendingDrivers.mockResolvedValue([pendingDriver()]);
    m.rejectDriver.mockResolvedValue({});
    renderWithProviders(<DriversPage />);
    const dossier = await openDossier();

    const button = within(dossier).getByRole('button', { name: 'Refuser le dossier' });
    await userEvent.type(within(dossier).getByLabelText('Motif de refus (communiqué au candidat)'), 'Flou');
    expect(button).toBeDisabled();
    await userEvent.type(within(dossier).getByLabelText('Motif de refus (communiqué au candidat)'), ' : merci de reprendre les photos');
    await userEvent.click(button);
    await waitFor(() => expect(m.rejectDriver).toHaveBeenCalledWith('d1', 'Flou : merci de reprendre les photos'));
  });

  it('accessibilité (axe)', async () => {
    m.pendingDrivers.mockResolvedValue([pendingDriver()]);
    const { container } = renderWithProviders(<DriversPage />);
    await openDossier();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Incidents SOS', () => {
  it('prise en charge puis clôture avec compte rendu', async () => {
    m.incidents.mockResolvedValue({ items: [incident], total: 1, page: 1, pageSize: 25 });
    m.acknowledgeIncident.mockResolvedValue({});
    m.resolveIncident.mockResolvedValue({});
    const { container } = renderWithProviders(<IncidentsPage />);

    expect(await screen.findByRole('link', { name: '+33600000001' })).toHaveAttribute('href', 'tel:+33600000001');
    await userEvent.click(screen.getByRole('button', { name: 'Prendre en charge' }));
    await waitFor(() => expect(m.acknowledgeIncident).toHaveBeenCalledWith('inc-1'));

    const close = screen.getByRole('button', { name: 'Clôturer l’incident' });
    expect(close).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Compte rendu de résolution'), 'Passagère rappelée, tout va bien.');
    await userEvent.click(close);
    await waitFor(() => expect(m.resolveIncident).toHaveBeenCalledWith('inc-1', 'Passagère rappelée, tout va bien.'));
    expect(await axe(container)).toHaveNoViolations();
  });

  it('caméra embarquée : conservation de l’enregistrement demandée au chauffeur, puis état affiché', async () => {
    m.incidents.mockResolvedValueOnce({ items: [incident], total: 1, page: 1, pageSize: 25 });
    m.requestFootage.mockResolvedValue({ incidentId: 'inc-1' });
    renderWithProviders(<IncidentsPage />);
    expect(await screen.findByText('Non demandé')).toBeInTheDocument();
    m.incidents.mockResolvedValue({
      items: [{ ...incident, footageRequestedAt: '2026-10-18T09:00:00.000Z', footageAcknowledgedAt: null }], total: 1, page: 1, pageSize: 25,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Demander au chauffeur de conserver l’enregistrement' }));
    await waitFor(() => expect(m.requestFootage).toHaveBeenCalledWith('inc-1'));
    expect(await screen.findByText(/Conservation demandée le/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Demander au chauffeur de conserver l’enregistrement' })).not.toBeInTheDocument();
  });

  it('signalement d’un chauffeur : libellé dédié, sans position (non géolocalisé)', async () => {
    m.incidents.mockResolvedValue({
      items: [{ ...incident, id: 'inc-2', type: 'driver_report', notes: 'Conduite dangereuse — Vitesse excessive' }],
      total: 1, page: 1, pageSize: 25,
    });
    renderWithProviders(<IncidentsPage />);
    expect(await screen.findByText(/Signalement chauffeur/)).toBeInTheDocument();
    expect(screen.getByText('Conduite dangereuse — Vitesse excessive')).toBeInTheDocument();
    expect(screen.queryByText('Position')).not.toBeInTheDocument();
  });

  it('alerte SOS en direct : bandeau visible sur toutes les pages', async () => {
    renderWithProviders(<AdminLayout />);
    await act(async () => {
      handlers.get('sos')?.({
        alert: { tripId: 't1', userId: 'u1', role: 'passenger', position: { lat: 48.85, lng: 2.35 }, timestamp: Date.now(), incidentId: 'inc-9' },
      });
    });
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('Alerte SOS reçue');
    expect(banner).toHaveTextContent('48.85000, 2.35000');
    expect(within(banner).getByRole('link', { name: 'Traiter les incidents' })).toHaveAttribute('href', '/incidents');
  });
});

describe('Courses', () => {
  it('suivi en direct d’une course via WebSocket', async () => {
    m.trips.mockResolvedValue({
      items: [{
        id: 't1', status: 'started', type: 'passenger', shuttleType: 'bleue', originAddress: 'Paris', destinationAddress: 'Rouen',
        scheduledAt: null, totalPriceCents: 12186, passengerName: 'Léa Roux', driverName: 'Nadia Benali', corporateId: null,
      }],
      total: 1, page: 1, pageSize: 25,
    });
    renderWithProviders(<TripsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Suivre la course de Léa Roux' }));
    expect(fakeSocket.emit).toHaveBeenCalledWith('subscribe:trip', { tripId: 't1' });

    await act(async () => {
      handlers.get('position')?.({ tripId: 't1', driverId: 'd', lat: 49.1, lng: 1.8, speed: 92, heading: 0, timestamp: Date.now() });
    });
    expect(await screen.findByText(/49\.10000, 1\.80000 · 92 km\/h/)).toBeInTheDocument();
  });
});

describe('Juridictions', () => {
  it('taux de TVA hors 0–100 refusé côté formulaire', async () => {
    m.jurisdictions.mockResolvedValue([{
      code: 'FR', name: 'France', vatPassengerRate: '0', vatParcelRate: '20', requiresRevtc: true, requiresVtcCard: true,
      minTripKm: 60, financialGuaranteePerVehicleCents: 150000, currency: 'EUR', leadDpa: 'DPC',
    }]);
    m.updateJurisdiction.mockResolvedValue({});
    const { container } = renderWithProviders(<JurisdictionsPage />);

    const parcel = await screen.findByLabelText('TVA marchandises / colis (%)');
    await userEvent.clear(parcel);
    await userEvent.type(parcel, '150');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer FR' }));
    expect(await screen.findByText('Entre 0 et 100')).toBeInTheDocument();
    expect(m.updateJurisdiction).not.toHaveBeenCalled();

    await userEvent.clear(parcel);
    await userEvent.type(parcel, '20');
    await userEvent.clear(screen.getByLabelText('Distance minimale (km)'));
    await userEvent.type(screen.getByLabelText('Distance minimale (km)'), '50');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer FR' }));
    await waitFor(() => expect(m.updateJurisdiction).toHaveBeenCalledWith('FR', expect.objectContaining({ minTripKm: 50, vatParcelRate: 20 })));
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Tarifs', () => {
  const defaults = {
    ratesPerKm: { rose: 120, bleue: 90, orange: 150, accessibility: 100 },
    childSeatCents: 500, wifiCents: 300, extraLuggageCents: 500, parcelFeeCents: 800, sharedParcelCents: 800,
  };
  const overview = (extra: object = {}) => ({
    jurisdiction: 'FR',
    current: { ...defaults, id: null, effectiveFrom: null, reason: 'Tarif par défaut (spécification)', createdBy: null },
    scheduled: [],
    history: [],
    defaults,
    ...extra,
  });

  it('saisie en euros, simulation sur 135 km, publication en centimes', async () => {
    m.tariffs.mockResolvedValue(overview());
    m.createTariff.mockResolvedValue({});
    const { container } = renderWithProviders(<TariffsPage />);

    const bleue = await screen.findByLabelText('Navette Bleue');
    expect(bleue).toHaveValue('0,90');
    // 135 km × 0,90 € = 121,50 € avant modification.
    const row = screen.getByRole('row', { name: /Navette Bleue/ });
    expect(within(row).getAllByText(/121,50/)).toHaveLength(2);

    await userEvent.clear(bleue);
    await userEvent.type(bleue, '0,95');
    expect(within(screen.getByRole('row', { name: /Navette Bleue/ })).getByText(/128,25/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Motif'), 'Hausse du gazole');
    await userEvent.click(screen.getByRole('button', { name: 'Publier le tarif' }));
    await waitFor(() =>
      expect(m.createTariff).toHaveBeenCalledWith(expect.objectContaining({
        jurisdiction: 'FR', reason: 'Hausse du gazole',
        ratesPerKm: { rose: 120, bleue: 95, orange: 150, accessibility: 100 }, sharedParcelCents: 800,
      })),
    );
    expect(await screen.findByText(/s’applique dès maintenant/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('motif obligatoire', async () => {
    m.tariffs.mockResolvedValue(overview());
    renderWithProviders(<TariffsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Publier le tarif' }));
    expect(await screen.findByText(/Indiquez le motif/)).toBeInTheDocument();
    expect(m.createTariff).not.toHaveBeenCalled();
  });

  it('variation de plus de 30 % : case de confirmation, puis nouvel envoi confirmé', async () => {
    m.tariffs.mockResolvedValue(overview());
    m.createTariff
      .mockRejectedValueOnce(new ApiError('Variation de plus de 30 % : tarif km bleue. Confirmez si c’est voulu.', 409))
      .mockResolvedValueOnce({});
    renderWithProviders(<TariffsPage />);

    const bleue = await screen.findByLabelText('Navette Bleue');
    await userEvent.clear(bleue);
    await userEvent.type(bleue, '9');
    await userEvent.type(screen.getByLabelText('Motif'), 'Test');
    await userEvent.click(screen.getByRole('button', { name: 'Publier le tarif' }));

    expect(await screen.findByText(/Variation de plus de 30 %/)).toBeInTheDocument();
    const publish = screen.getByRole('button', { name: 'Publier le tarif' });
    expect(publish).toBeDisabled();
    await userEvent.click(screen.getByLabelText('Je confirme cette variation de plus de 30 %'));
    await userEvent.click(publish);
    await waitFor(() => expect(m.createTariff).toHaveBeenLastCalledWith(expect.objectContaining({ confirmLargeChange: true })));
  });

  it('tarif programmé annulable, historique affiché', async () => {
    m.tariffs.mockResolvedValue(overview({
      scheduled: [{ ...defaults, id: 't-futur', effectiveFrom: '2026-11-01T00:00:00Z', reason: 'Baisse hiver', createdBy: 'ops' }],
      history: [{ ...defaults, id: 't-1', effectiveFrom: '2026-10-01T08:00:00Z', reason: 'Lancement', createdBy: 'ops' }],
    }));
    m.cancelTariff.mockResolvedValue({});
    renderWithProviders(<TariffsPage />);
    expect(await screen.findByText(/Baisse hiver/)).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Lancement' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Annuler ce tarif programmé' }));
    await waitFor(() => expect(m.cancelTariff).toHaveBeenCalledWith('t-futur'));
  });
});

describe('Factures', () => {
  const page = (sellerComplete: boolean) => ({
    items: [{
      id: 'inv-1', number: 'FA-2026-000001', kind: 'invoice', corporateId: null, customerUserId: 'p1',
      buyer: { name: 'Léa Martin', lines: [] }, totalCents: 12186, vatCents: 0, issuedAt: '2026-10-12T16:10:00Z', paymentStatus: 'paid', dueDate: null,
    }],
    total: 1, page: 1, pageSize: 50, sellerComplete,
  });

  it('mentions légales du vendeur incomplètes : alerte visible', async () => {
    m.invoices.mockResolvedValue(page(false));
    const { container } = renderWithProviders(<InvoicesPage />);
    expect(await screen.findByText(/Mentions légales du vendeur incomplètes/)).toBeInTheDocument();
    expect(screen.getByText('FA-2026-000001')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('mentions complètes : pas d’alerte ; téléchargement du PDF', async () => {
    m.invoices.mockResolvedValue(page(true));
    m.invoicePdf.mockResolvedValue(new Blob(['%PDF']));
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    globalThis.URL.revokeObjectURL = vi.fn();
    renderWithProviders(<InvoicesPage />);
    await screen.findByText('FA-2026-000001');
    expect(screen.queryByText(/Mentions légales du vendeur incomplètes/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Télécharger FA-2026-000001 en PDF' }));
    await waitFor(() => expect(m.invoicePdf).toHaveBeenCalledWith('inv-1'));
  });
});

describe('Notes des passagers', () => {
  const rating = {
    id: 'r1', tripId: 't1', stars: 1, comment: 'Insultes et conduite brusque', createdAt: '2026-10-01T08:00:00Z',
    driver: { id: 'd1', name: 'Nadia Benali' }, passenger: { id: 'p1', name: 'Léa Roux' },
  };

  beforeEach(() => {
    m.ratedDrivers.mockResolvedValue({
      items: [{ driverId: 'd1', name: 'Nadia Benali', rating: 2.5, ratingCount: 2, totalTrips: 10, lowCount: 1 }],
      total: 1, page: 1, pageSize: 25,
    });
    m.ratings.mockResolvedValue({ items: [rating], total: 1, page: 1, pageSize: 25 });
  });

  it('chauffeurs à surveiller, filtre par chauffeur, notes basses et commentaires', async () => {
    const { container } = renderWithProviders(<RatingsPage />);
    expect(await screen.findByText('À surveiller')).toBeInTheDocument();
    expect(screen.getByText(/2,50 \/ 5/)).toBeInTheDocument();
    expect(await screen.findByText('Insultes et conduite brusque')).toBeInTheDocument();
    expect(screen.getByText('1 sur 5')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Voir ses notes/ }));
    await waitFor(() => expect(m.ratings).toHaveBeenLastCalledWith(expect.objectContaining({ driverId: 'd1', page: 1 })));
    expect(screen.getByRole('heading', { name: 'Notes de Nadia Benali' })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Note'), '2');
    await userEvent.click(screen.getByLabelText('Avec commentaire seulement'));
    await waitFor(() => expect(m.ratings).toHaveBeenLastCalledWith(expect.objectContaining({ maxStars: 2, withComment: true })));
    expect(await axe(container)).toHaveNoViolations();
  });

  it('retrait d’une note : motif de 10 caractères minimum, puis listes rafraîchies', async () => {
    m.removeRating.mockResolvedValue({ removed: true, driver: { rating: 4, ratingCount: 1 } });
    renderWithProviders(<RatingsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Retirer cette note' }));
    const confirm = screen.getByRole('button', { name: 'Confirmer le retrait' });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Motif du retrait/), 'Propos injurieux hors sujet');
    await userEvent.click(confirm);
    await waitFor(() => expect(m.removeRating).toHaveBeenCalledWith('r1', 'Propos injurieux hors sujet'));
    await waitFor(() => expect(m.ratedDrivers).toHaveBeenCalledTimes(2));
  });
});
