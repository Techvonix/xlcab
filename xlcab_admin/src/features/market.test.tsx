import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { renderWithProviders } from '@/test/fixtures';

// Bourse de transport dans le dashboard : opérateurs, départs en danger,
// annulations, pénalités, demandes. Serveur simulé.

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      operators: vi.fn(), reviewOperator: vi.fn(), atRiskDepartures: vi.fn(), rescueCandidates: vi.fn(), assignDeparture: vi.fn(),
      cancellations: vi.fn(), reviewCancellation: vi.fn(), penalties: vi.fn(), decidePenalty: vi.fn(), marketRequests: vi.fn(),
    },
  };
});

const { api, ApiError } = await import('@/lib/api');
const { OperatorsPage } = await import('./operators/OperatorsPage');
const { MarketPage } = await import('./market/MarketPage');
const m = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const operator = {
  id: 'op1', kind: 'independent', legalName: 'Djamel Navettes', siret: '12345678901234', transportLicense: 'LOTI-2026-0042', cities: ['Paris'],
  status: 'pending', perSeatAllowed: false, name: 'Djamel Haddad', email: 'djamel@x.fr', driverApproved: true, openLines: 1,
};
const paged = <T,>(items: T[]) => ({ items, total: items.length, page: 1, pageSize: 25 });

beforeEach(() => {
  vi.clearAllMocks();
  m.atRiskDepartures.mockResolvedValue([]);
  m.cancellations.mockResolvedValue([]);
  m.penalties.mockResolvedValue([]);
  m.marketRequests.mockResolvedValue(paged([]));
});

describe('Opérateurs', () => {
  it('profil à vérifier : décision impossible sans motif, puis vérification et vente à la place', async () => {
    m.operators.mockResolvedValue(paged([operator]));
    m.reviewOperator.mockResolvedValue({});
    const { container } = renderWithProviders(<OperatorsPage />);

    expect(await screen.findByText('LOTI-2026-0042')).toBeInTheDocument();
    expect(screen.getByText('Non autorisée')).toBeInTheDocument();
    const verify = screen.getByRole('button', { name: /Vérifier l’opérateur/ });
    expect(verify).toBeDisabled();
    expect(await axe(container)).toHaveNoViolations();

    await userEvent.type(screen.getByLabelText(/Motif de la décision/), 'Kbis et licence contrôlés');
    await userEvent.click(verify);
    await waitFor(() => expect(m.reviewOperator).toHaveBeenCalledWith('op1', { status: 'verified', reason: 'Kbis et licence contrôlés' }));

    await userEvent.type(screen.getByLabelText(/Motif de la décision/), 'Licence LOTI vérifiée');
    await userEvent.click(screen.getByRole('button', { name: /Autoriser la vente à la place/ }));
    await waitFor(() => expect(m.reviewOperator).toHaveBeenLastCalledWith('op1', { perSeatAllowed: true, reason: 'Licence LOTI vérifiée' }));
  });

  it('refus du serveur affiché (licence manquante) ; filtre par statut', async () => {
    m.operators.mockResolvedValue(paged([{ ...operator, transportLicense: null }]));
    m.reviewOperator.mockRejectedValue(new ApiError('Licence de transport non renseignée : vente à la place impossible', 400));
    renderWithProviders(<OperatorsPage />);
    expect(await screen.findByText('Non renseignée')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Motif de la décision/), 'Demande du chauffeur');
    await userEvent.click(screen.getByRole('button', { name: /Autoriser la vente à la place/ }));
    expect(await screen.findByText('Licence de transport non renseignée : vente à la place impossible')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Statut'), 'suspended');
    await waitFor(() => expect(m.operators).toHaveBeenLastCalledWith({ status: 'suspended', page: 1 }));
  });
});

describe('Bourse et lignes', () => {
  it('départ en danger : étape, chauffeurs sollicités, affectation manuelle d’un chauffeur disponible', async () => {
    m.atRiskDepartures.mockResolvedValue([
      {
        departureId: 'dep1', departureAt: '2026-10-11T03:00:00Z', rescueStatus: 'searching', rescueStage: 'backup2', failedDriverName: 'Djamel Haddad',
        origin: 'Porte Maillot', destination: 'Aéroport de Beauvais', passengers: 7,
        offers: [{ driverId: 'k1', name: 'Karim', stage: 'backup2', status: 'expired', expiresAt: '2026-10-10T22:00:00Z' }],
      },
    ]);
    m.rescueCandidates.mockResolvedValue([{ driverId: 'c1', name: 'Chris Moreau', phone: '+33600000008', vehicleId: 'v9', vehicle: 'Mercedes Sprinter', capacity: 13 }]);
    m.assignDeparture.mockResolvedValue({});
    const { container } = renderWithProviders(<MarketPage />);

    expect(await screen.findByText(/Porte Maillot → Aéroport de Beauvais/)).toBeInTheDocument();
    expect(screen.getByText('Réserve n° 2 sollicitée')).toBeInTheDocument();
    expect(screen.getByText(/Karim — n’a pas répondu/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await userEvent.click(screen.getByRole('button', { name: 'Affecter un chauffeur' }));
    const assign = await screen.findByRole('button', { name: /^Affecter Chris Moreau/ });
    expect(screen.getByText(/Mercedes Sprinter/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '+33600000008' })).toHaveAttribute('href', 'tel:+33600000008');
    await userEvent.click(assign);
    await waitFor(() => expect(m.assignDeparture).toHaveBeenCalledWith('dep1', 'c1', 'v9'));
  });

  it('justificatif de force majeure : reconnu avec un motif', async () => {
    m.cancellations.mockResolvedValue([
      {
        id: 'can1', driverId: 'd1', driverName: 'Djamel Haddad', trigger: 'driver_cancel', reason: 'Malade', minutesBefore: 300, lastMinute: true,
        status: 'justification_pending', justification: 'Hospitalisation, certificat transmis', createdAt: '2026-10-10T20:00:00Z',
      },
    ]);
    m.reviewCancellation.mockResolvedValue({});
    renderWithProviders(<MarketPage />);
    const section = await screen.findByRole('region', { name: 'Annulations des chauffeurs' });
    expect(await within(section).findByText('Hospitalisation, certificat transmis')).toBeInTheDocument();
    await userEvent.type(within(section).getByLabelText(/Motif de la décision/), 'Certificat médical reçu');
    await userEvent.click(within(section).getByRole('button', { name: 'Reconnaître la force majeure' }));
    await waitFor(() => expect(m.reviewCancellation).toHaveBeenCalledWith('can1', 'justified', 'Certificat médical reçu'));
  });

  it('pénalité contestée : maintenue ou annulée, toujours avec un motif', async () => {
    m.penalties.mockResolvedValue([
      { id: 'pen1', driverId: 'd1', driverName: 'Djamel Haddad', amountCents: 26000, status: 'contested', contestUntil: '2026-10-17T20:00:00Z', contestReason: 'Panne constatée', createdAt: '2026-10-10T20:00:00Z' },
    ]);
    m.decidePenalty.mockResolvedValue({});
    renderWithProviders(<MarketPage />);
    const section = await screen.findByRole('region', { name: 'Pénalités' });
    expect(await within(section).findByText(/260,00/)).toBeInTheDocument();
    const cancel = within(section).getByRole('button', { name: 'Annuler la pénalité' });
    expect(cancel).toBeDisabled();
    await userEvent.type(within(section).getByLabelText(/Motif de la décision/), 'Facture du garage reçue');
    await userEvent.click(cancel);
    await waitFor(() => expect(m.decidePenalty).toHaveBeenCalledWith('pen1', 'cancel', 'Facture du garage reçue'));
  });

  it('demandes de la bourse : celles à surveiller sont signalées en toutes lettres', async () => {
    m.marketRequests.mockResolvedValue(paged([
      { id: 'r1', status: 'published', originAddress: 'Paris', destinationAddress: 'Rouen', departureAt: '2026-10-13T15:00:00Z', passengers: 6, requesterEmail: 'lea@x.fr', offers: 0, needsAttention: true },
    ]));
    renderWithProviders(<MarketPage />);
    expect(await screen.findByText('Paris → Rouen')).toBeInTheDocument();
    expect(screen.getByText('À surveiller')).toBeInTheDocument();
    expect(screen.getByText('Aucun départ en danger.')).toBeInTheDocument();
  });
});
