import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { renderWithProviders } from '@/test/fixtures';

// Reversements aux opérateurs (Stripe Connect) dans le dashboard. Serveur simulé.

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: { payouts: vi.fn(), retryPayout: vi.fn(), bonuses: vi.fn(), retryBonus: vi.fn() } };
});

const { api, ApiError } = await import('@/lib/api');
const { PayoutsPage } = await import('./payouts/PayoutsPage');
const m = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const payout = (over: Record<string, unknown> = {}) => ({
  id: 'po1', tripId: 'trip-1', driverId: 'd1', driverName: 'Djamel Haddad', driverEmail: 'djamel@x.fr', amountCents: 4500, grossCents: 4500, withheldCents: 0,
  status: 'failed', attempts: 10, lastError: 'Stripe API indisponible', nextAttemptAt: null, createdAt: '2026-10-12T05:30:00.000Z', paidAt: null, needsAttention: true,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.bonuses.mockResolvedValue([]);
});

describe('Reversements', () => {
  it('rien à traiter : message clair', async () => {
    m.payouts.mockResolvedValue([]);
    const { container } = renderWithProviders(<PayoutsPage />);
    expect(await screen.findByText('Tous les reversements sont partis.')).toBeInTheDocument();
    expect(m.payouts).toHaveBeenCalledWith(undefined);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('échec après dix essais : signalé en clair, relance manuelle, résultat annoncé', async () => {
    m.payouts.mockResolvedValue([payout()]);
    m.retryPayout.mockResolvedValue({ id: 'po1', status: 'paid' });
    const { container } = renderWithProviders(<PayoutsPage />);

    const card = (await screen.findByText('Intervention requise')).closest('li')!;
    expect(within(card).getByText(/Djamel Haddad ·/)).toBeInTheDocument();
    expect(within(card).getByText(/Échec du virement/)).toBeInTheDocument();
    expect(within(card).getByText('Dernière erreur : Stripe API indisponible')).toBeInTheDocument();
    expect(within(card).getByText('45,00 €')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await userEvent.click(within(card).getByRole('button', { name: /Relancer le virement/ }));
    await waitFor(() => expect(m.retryPayout).toHaveBeenCalledWith('po1'));
    expect(await screen.findByText('Virement effectué.')).toBeInTheDocument();
  });

  it('relance sans effet (compte de versement toujours absent) : l’état est expliqué', async () => {
    m.payouts.mockResolvedValue([payout({ status: 'blocked', needsAttention: false, attempts: 0, lastError: null })]);
    m.retryPayout.mockResolvedValue({ id: 'po1', status: 'blocked' });
    renderWithProviders(<PayoutsPage />);

    expect(await screen.findByText(/n’a pas de compte de versement validé/)).toBeInTheDocument();
    expect(screen.queryByText('Intervention requise')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Relancer le virement/ }));
    expect(await screen.findByText('Le virement n’est pas parti : En attente du compte de versement.')).toBeInTheDocument();
  });

  it('refus du serveur à la relance : affiché sur le reversement concerné', async () => {
    m.payouts.mockResolvedValue([payout()]);
    m.retryPayout.mockRejectedValue(new ApiError('Ce reversement est déjà traité', 409));
    renderWithProviders(<PayoutsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Relancer le virement/ }));
    expect(await screen.findByText('Ce reversement est déjà traité')).toBeInTheDocument();
  });

  it('filtre « Versé » : détail de la retenue, aucune relance proposée', async () => {
    m.payouts.mockResolvedValue([]);
    renderWithProviders(<PayoutsPage />);
    await screen.findByText('Tous les reversements sont partis.');

    m.payouts.mockResolvedValue([
      payout({ status: 'paid', needsAttention: false, lastError: null, amountCents: 6400, grossCents: 16200, withheldCents: 9800, paidAt: '2026-10-12T06:00:00.000Z' }),
    ]);
    await userEvent.selectOptions(screen.getByLabelText('Statut'), 'paid');
    await waitFor(() => expect(m.payouts).toHaveBeenLastCalledWith('paid'));
    expect(await screen.findByText('98,00 € sur un revenu de 162,00 €')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Relancer le virement/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Dernière erreur/)).not.toBeInTheDocument();
  });

  it('bonus de reprise : en attente du recouvrement, puis relance d’un virement en échec', async () => {
    m.payouts.mockResolvedValue([]);
    const bonus = {
      id: 'b1', driverId: 'k1', driverName: 'Karim Benali', departureId: 'dep1', amountCents: 16000, status: 'pending', attempts: 0, lastError: null,
      createdAt: '2026-10-12T05:30:00.000Z', paidAt: null, penaltyCollectedCents: 4500, penaltyCents: 26000, needsAttention: false,
    };
    m.bonuses.mockResolvedValue([bonus, { ...bonus, id: 'b2', driverName: 'Samir Kaci', status: 'failed', attempts: 2, lastError: 'Solde insuffisant', penaltyCollectedCents: 26000 }]);
    m.retryBonus.mockResolvedValue({ id: 'b2', status: 'paid' });
    const { container } = renderWithProviders(<PayoutsPage />);

    const waiting = (await screen.findByText(/Karim Benali ·/)).closest('li')!;
    expect(within(waiting).getByText(/En attente du recouvrement de la pénalité/)).toBeInTheDocument();
    expect(within(waiting).getByText('Recouvré sur les reversements : 45,00 € sur 260,00 €')).toBeInTheDocument();
    // Pas de relance tant que la pénalité n'est pas recouvrée.
    expect(within(waiting).queryByRole('button')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    const failed = screen.getByText(/Samir Kaci ·/).closest('li')!;
    expect(within(failed).getByText('Dernière erreur : Solde insuffisant')).toBeInTheDocument();
    await userEvent.click(within(failed).getByRole('button', { name: /Relancer le virement du bonus/ }));
    await waitFor(() => expect(m.retryBonus).toHaveBeenCalledWith('b2'));
  });

  it('statut sans résultat : message distinct', async () => {
    m.payouts.mockResolvedValue([]);
    renderWithProviders(<PayoutsPage />);
    await userEvent.selectOptions(await screen.findByLabelText('Statut'), 'failed');
    expect(await screen.findByText('Aucun reversement pour ce statut.')).toBeInTheDocument();
  });
});
