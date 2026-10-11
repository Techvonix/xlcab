import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { analytics, invoice, members, renderWithProviders } from '@/test/fixtures';

// Les pages appellent l'API via `api` : on la remplace, sans réseau.
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      analytics: vi.fn(),
      invoices: vi.fn(),
      issuedInvoices: vi.fn(),
      invoicePdf: vi.fn(),
      members: vi.fn(),
      addMember: vi.fn(),
      removeMember: vi.fn(),
      geocode: vi.fn(),
      quote: vi.fn(),
      book: vi.fn(),
    },
    twoFactor: { status: vi.fn(), setup: vi.fn(), enable: vi.fn(), verify: vi.fn() },
  };
});

vi.mock('@/lib/export', () => ({
  download: vi.fn(),
  invoiceToCsv: vi.fn(() => 'csv'),
  invoiceToPdf: vi.fn(() => ({ output: () => new Blob(['%PDF']) })),
}));

const { api, ApiError, twoFactor } = await import('@/lib/api');
const { TwoFactorGate } = await import('./auth/TwoFactorGate');
const tf = twoFactor as unknown as Record<string, ReturnType<typeof vi.fn>>;
const exporter = await import('@/lib/export');
const { DashboardPage } = await import('./dashboard/DashboardPage');
const { TeamPage } = await import('./team/TeamPage');
const { InvoicesPage } = await import('./invoices/InvoicesPage');
const { BookCollaboratorPage } = await import('./booking/BookCollaboratorPage');
const { LoginPage } = await import('./auth/LoginPage');

const mocked = api as unknown as Record<keyof typeof api, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
  mocked.analytics.mockResolvedValue(analytics);
  mocked.invoices.mockResolvedValue(invoice);
  mocked.members.mockResolvedValue(members);
  mocked.issuedInvoices.mockResolvedValue([]);
});

describe('Tableau de bord', () => {
  // Les montants apparaissent aussi dans les répartitions et le tableau
  // accessible : on cible la zone des indicateurs.
  const kpis = () => screen.findByRole('region', { name: 'Indicateurs d’octobre 2026' });

  it('KPIs du mois, TVA séparée et budget', async () => {
    renderWithProviders(<DashboardPage />);
    const region = await kpis();
    expect(within(region).getByText('dont HT transport de personnes')).toBeInTheDocument();
    expect(within(region).getByText('302,70 €')).toBeInTheDocument(); // dépense TTC
    expect(within(region).getByText(/TVA 1,60 € \(20 %\)/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Budget utilisé' })).toHaveAttribute('aria-valuenow', '30');
  });

  it('le graphique a un équivalent tableau pour les lecteurs d’écran', async () => {
    renderWithProviders(<DashboardPage />);
    const table = await screen.findByRole('table', { name: 'Dépense TTC par mois' });
    expect(within(table).getAllByRole('row')).toHaveLength(7); // en-tête + 6 mois
  });

  it('changer de mois recharge les indicateurs', async () => {
    renderWithProviders(<DashboardPage />);
    await kpis();
    // Toujours un mois DIFFÉRENT du mois courant (chargé par défaut) :
    // sinon le test passerait sans rien vérifier.
    const now = new Date();
    const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const month = `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
    expect(mocked.analytics).not.toHaveBeenCalledWith(month);

    // jsdom ne simule pas la frappe dans un champ type="month" : on
    // déclenche le changement de valeur comme le ferait le navigateur.
    fireEvent.change(screen.getByLabelText('Mois'), { target: { value: month } });
    await waitFor(() => expect(mocked.analytics).toHaveBeenLastCalledWith(month));
  });

  it('accessibilité (axe)', async () => {
    const { container } = renderWithProviders(<DashboardPage />);
    await kpis();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Équipe', () => {
  it('tableau des collaborateurs, sans bouton "Retirer" pour l’administrateur', async () => {
    renderWithProviders(<TeamPage />);
    expect(await screen.findByText('Bruno Petit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirer Bruno Petit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retirer Alice Martin' })).not.toBeInTheDocument();
    expect(screen.getByText('500,00 €')).toBeInTheDocument(); // plafond
  });

  it('tri par colonne annoncé (aria-sort)', async () => {
    renderWithProviders(<TeamPage />);
    await screen.findByText('Bruno Petit');
    await userEvent.click(screen.getByRole('button', { name: /Dépense du mois/ }));
    expect(screen.getByRole('columnheader', { name: /Dépense du mois/ })).toHaveAttribute('aria-sort');
  });

  it('ajout : validation, plafond converti en centimes', async () => {
    mocked.addMember.mockResolvedValue({ id: 'new' });
    renderWithProviders(<TeamPage />);
    await screen.findByText('Bruno Petit');

    await userEvent.type(screen.getByLabelText('Email'), 'pas-un-email');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter à l’équipe' }));
    expect(await screen.findByText('Adresse email invalide')).toBeInTheDocument();
    expect(mocked.addMember).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText('Email'));
    await userEvent.type(screen.getByLabelText('Email'), 'claire@acme.fr');
    await userEvent.type(screen.getByLabelText('Plafond mensuel (€)'), '750,50');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter à l’équipe' }));

    await waitFor(() =>
      expect(mocked.addMember).toHaveBeenCalledWith({ email: 'claire@acme.fr', monthlyLimitCents: 75050 }),
    );
    expect(await screen.findByText('claire@acme.fr a été ajouté(e) à l’équipe.')).toBeInTheDocument();
  });

  it('refus du serveur affiché tel quel', async () => {
    mocked.addMember.mockRejectedValue(new ApiError('Déjà rattaché à une autre entreprise', 409));
    renderWithProviders(<TeamPage />);
    await screen.findByText('Bruno Petit');
    await userEvent.type(screen.getByLabelText('Email'), 'x@globex.fr');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter à l’équipe' }));
    expect(await screen.findByText('Déjà rattaché à une autre entreprise')).toBeInTheDocument();
  });

  it('retrait après confirmation seulement', async () => {
    mocked.removeMember.mockResolvedValue({ removed: true });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderWithProviders(<TeamPage />);
    const button = await screen.findByRole('button', { name: 'Retirer Bruno Petit' });

    await userEvent.click(button);
    expect(mocked.removeMember).not.toHaveBeenCalled();
    await userEvent.click(button);
    await waitFor(() => expect(mocked.removeMember).toHaveBeenCalledWith('m-emp'));
    confirm.mockRestore();
  });

  it('accessibilité (axe)', async () => {
    const { container } = renderWithProviders(<TeamPage />);
    await screen.findByText('Bruno Petit');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Facturation', () => {
  it('totaux par régime de TVA et mention d’exonération', async () => {
    renderWithProviders(<InvoicesPage />);
    expect(await screen.findByText('Relevé d’octobre 2026')).toBeInTheDocument();
    const totals = screen.getByText('TVA marchandises (20 %)').parentElement!;
    expect(totals).toHaveTextContent('1,60 €');
    expect(screen.getByText(/Total TTC facturable \(1 course\(s\)\)/).parentElement).toHaveTextContent('212,70 €');
    expect(screen.getByText(/261-4-4° CGI/)).toBeInTheDocument();
    expect(screen.getByText('non facturée')).toBeInTheDocument();
  });

  it('exports CSV et PDF nommés avec le mois', async () => {
    renderWithProviders(<InvoicesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Exporter en CSV' }));
    await waitFor(() => expect(exporter.download).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/^xlcab-releve-\d{4}-\d{2}\.csv$/)));
    await userEvent.click(screen.getByRole('button', { name: 'Exporter en PDF' }));
    await waitFor(() => expect(exporter.download).toHaveBeenLastCalledWith(expect.any(Blob), expect.stringMatching(/\.pdf$/)));
  });

  it('factures émises : liste, avoir signalé, téléchargement du PDF', async () => {
    mocked.issuedInvoices.mockResolvedValue([
      { id: 'inv-1', number: 'FA-2026-000012', kind: 'invoice', periodStart: '2026-09-01T00:00:00.000Z', periodEnd: '2026-10-01T00:00:00.000Z', subtotalCents: 24372, vatCents: 0, totalCents: 24372, currency: 'EUR', issuedAt: '2026-10-01T02:00:00Z', paymentStatus: 'due', dueDate: '2026-10-31T02:00:00Z' },
      { id: 'av-1', number: 'AV-2026-000002', kind: 'credit_note', periodStart: null, periodEnd: null, subtotalCents: -1000, vatCents: 0, totalCents: -1000, currency: 'EUR', issuedAt: '2026-10-03T10:00:00Z', paymentStatus: 'paid', dueDate: null },
    ]);
    mocked.invoicePdf.mockResolvedValue(new Blob(['%PDF-1.3']));
    renderWithProviders(<InvoicesPage />);

    expect(await screen.findByText('FA-2026-000012')).toBeInTheDocument();
    expect(screen.getByText('Avoir AV-2026-000002')).toBeInTheDocument();
    expect(screen.getByText('septembre 2026')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Télécharger la facture FA-2026-000012 en PDF' }));
    await waitFor(() => expect(exporter.download).toHaveBeenCalledWith(expect.any(Blob), 'FA-2026-000012.pdf'));
    expect(mocked.invoicePdf).toHaveBeenCalledWith('inv-1');
  });

  it('accessibilité (axe)', async () => {
    mocked.issuedInvoices.mockResolvedValue([
      { id: 'inv-1', number: 'FA-2026-000012', kind: 'invoice', periodStart: '2026-09-01T00:00:00.000Z', periodEnd: null, subtotalCents: 100, vatCents: 0, totalCents: 100, currency: 'EUR', issuedAt: '2026-10-01T02:00:00Z', paymentStatus: 'due', dueDate: '2026-10-31T02:00:00Z' },
    ]);
    const { container } = renderWithProviders(<InvoicesPage />);
    await screen.findByText('FA-2026-000012');
    await screen.findByText('Relevé d’octobre 2026');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Réserver pour un collaborateur', () => {
  const quote = {
    distanceKm: 135.4, durationMin: 97, priceCents: 21110, vatCents: 160, totalCents: 21270, currency: 'EUR',
    vatLines: [
      { regime: 'passenger', baseCents: 20310, ratePercent: 0, vatCents: 0 },
      { regime: 'parcel', baseCents: 800, ratePercent: 20, vatCents: 160 },
    ],
  };

  async function fillForm() {
    mocked.geocode
      .mockResolvedValueOnce([{ address: 'Gare de Lyon, 75012 Paris', lat: 48.8443, lng: 2.3744 }])
      .mockResolvedValueOnce([{ address: 'Gare de Rouen, 76000 Rouen', lat: 49.4488, lng: 1.0942 }]);
    renderWithProviders(<BookCollaboratorPage />);
    await screen.findByRole('option', { name: /Bruno Petit/ });
    await userEvent.selectOptions(screen.getByLabelText('Collaborateur'), 'm-emp');

    await userEvent.type(screen.getByLabelText('Adresse — Départ'), 'gare de lyon');
    await userEvent.click(screen.getByRole('button', { name: 'Rechercher l’adresse : Départ' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Gare de Lyon, 75012 Paris' }));

    await userEvent.type(screen.getByLabelText('Adresse — Arrivée'), 'gare de rouen');
    await userEvent.click(screen.getByRole('button', { name: 'Rechercher l’adresse : Arrivée' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Gare de Rouen, 76000 Rouen' }));

    const tomorrow = new Date(Date.now() + 26 * 3600 * 1000);
    const local = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    await userEvent.type(screen.getByLabelText('Date et heure de départ'), local);
    await userEvent.click(screen.getByLabelText('Colis (TVA 20 % sur la part colis)'));
  }

  it('devis puis réservation, facturée à l’entreprise', async () => {
    mocked.quote.mockResolvedValue(quote);
    mocked.book.mockResolvedValue({ tripId: 't1', status: 'pending', scheduledAt: new Date().toISOString(), quote });
    await fillForm();

    await userEvent.click(screen.getByRole('button', { name: 'Calculer le prix' }));
    expect(await screen.findByText(/Colis \(HT\) — TVA 20 %/)).toBeInTheDocument();

    const payload = mocked.quote.mock.calls[0][0];
    expect(payload).toMatchObject({
      origin: { lat: 48.8443, lng: 2.3744 },
      originAddress: 'Gare de Lyon, 75012 Paris',
      withParcel: true,
      seats: 1,
      shuttleType: 'orange',
    });
    expect(payload).not.toHaveProperty('totalCents');

    await userEvent.click(screen.getByRole('button', { name: /Réserver — 212,70/ }));
    await waitFor(() => expect(mocked.book).toHaveBeenCalledWith(expect.objectContaining({ memberId: 'm-emp' })));
    expect(await screen.findByText(/Course réservée pour Bruno Petit/)).toBeInTheDocument();
  });

  it('toute modification efface le devis (jamais de réservation sur un prix périmé)', async () => {
    mocked.quote.mockResolvedValue(quote);
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Calculer le prix' }));
    await screen.findByText('Récapitulatif');

    await userEvent.click(screen.getByLabelText('Wi-Fi à bord'));
    expect(screen.queryByText('Récapitulatif')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calculer le prix' })).toBeInTheDocument();
  });

  it('formulaire incomplet : erreurs annoncées, aucun appel au serveur', async () => {
    renderWithProviders(<BookCollaboratorPage />);
    await screen.findByRole('option', { name: /Bruno Petit/ });
    await userEvent.click(screen.getByRole('button', { name: 'Calculer le prix' }));
    expect(await screen.findByText('Choisissez un collaborateur')).toBeInTheDocument();
    expect(screen.getAllByText('Adresse requise')).toHaveLength(2);
    expect(mocked.quote).not.toHaveBeenCalled();
  });

  it('refus du serveur (ex. plafond) affiché', async () => {
    mocked.quote.mockRejectedValue(new ApiError('Distance minimale : 60 km', 400));
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Calculer le prix' }));
    expect(await screen.findByText('Distance minimale : 60 km')).toBeInTheDocument();
  });

  it('accessibilité (axe)', async () => {
    const { container } = renderWithProviders(<BookCollaboratorPage />);
    await screen.findByRole('option', { name: /Bruno Petit/ });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Connexion', () => {
  it('validation et accessibilité', async () => {
    const { container } = renderWithProviders(<LoginPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByText('Adresse email invalide')).toBeInTheDocument();
    expect(screen.getByLabelText('Email professionnel')).toHaveAttribute('aria-invalid', 'true');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Double authentification (Partie 8 : obligatoire pour les admins d’entreprise)', () => {
  it('premier accès : QR code, clé manuelle, puis confirmation par code', async () => {
    tf.status.mockResolvedValue({ enabled: false, required: true });
    tf.setup.mockResolvedValue({ otpauthUrl: 'otpauth://totp/XLCAB:sophie?secret=GEZDGNBVGY3TQOJQ&issuer=XLCAB', secret: 'GEZDGNBVGY3TQOJQ' });
    tf.enable.mockResolvedValue(undefined);
    renderWithProviders(<TwoFactorGate />);

    expect(await screen.findByText(/obligatoire pour les administrateurs d’un compte entreprise/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Activer la double authentification' }));
    expect(await screen.findByAltText('QR code d’activation de la double authentification')).toBeInTheDocument();
    expect(screen.getByText('GEZD GNBV GY3T QOJQ')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Code de confirmation'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer l’activation' }));
    await waitFor(() => expect(tf.enable).toHaveBeenCalledWith('123456'));
  });

  it('connexion suivante : code refusé → message du serveur, champ vidé ; accessibilité', async () => {
    tf.status.mockResolvedValue({ enabled: true, required: true });
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
