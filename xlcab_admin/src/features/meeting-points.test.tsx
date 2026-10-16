import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { renderWithProviders } from '@/test/fixtures';

// Catalogue des points de rencontre dans le dashboard. Serveur simulé.

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: { meetingPoints: vi.fn(), createMeetingPoint: vi.fn(), updateMeetingPoint: vi.fn() } };
});

const { api } = await import('@/lib/api');
const { MeetingPointsPage } = await import('./meeting-points/MeetingPointsPage');
const m = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const point = (over: Record<string, unknown> = {}) => ({
  id: 'p1', city: 'Paris', name: 'Porte d’Orléans', address: 'Place du 25 Août 1944, 75014 Paris', lat: 48.8235, lng: 2.3253,
  instructions: null, transit: 'Métro 4, tram T3a', jurisdiction: 'FR', active: true, ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('Points de rencontre', () => {
  it('catalogue affiché par ville ; consignes manquantes signalées ; accessible', async () => {
    m.meetingPoints.mockResolvedValue([point(), point({ id: 'p2', city: 'Clermont-Ferrand', name: 'Gare de Clermont-Ferrand', address: 'Avenue de l’Union Soviétique, Clermont-Ferrand', transit: null })]);
    const { container } = renderWithProviders(<MeetingPointsPage />);
    const card = (await screen.findByText('Place du 25 Août 1944, 75014 Paris')).closest('li')!;
    expect(within(card).getByText('À préciser')).toBeInTheDocument();
    expect(within(card).getByText('Métro 4, tram T3a')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Ville', { selector: 'select' }), 'Clermont-Ferrand');
    expect(screen.queryByText('Place du 25 Août 1944, 75014 Paris')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ajout : coordonnées exigées (virgule acceptée), point envoyé puis annoncé', async () => {
    m.meetingPoints.mockResolvedValue([]);
    m.createMeetingPoint.mockResolvedValue(point({ id: 'p3', name: 'Porte de Saint-Cloud' }));
    renderWithProviders(<MeetingPointsPage />);
    await screen.findByText('Aucun point de rencontre pour le moment.');

    const form = screen.getByRole('button', { name: 'Ajouter le point' }).closest('form')!;
    await userEvent.type(within(form).getByLabelText('Ville'), 'Paris');
    await userEvent.type(within(form).getByLabelText('Nom'), 'Porte de Saint-Cloud');
    await userEvent.type(within(form).getByLabelText('Adresse'), 'Place de la Porte de Saint-Cloud, 75016 Paris');
    await userEvent.type(within(form).getByLabelText('Latitude'), '48,8378');
    expect(within(form).getByRole('button', { name: 'Ajouter le point' })).toBeDisabled();
    await userEvent.type(within(form).getByLabelText('Longitude'), '2.2567');
    await userEvent.type(within(form).getByLabelText('Transports à proximité'), 'Métro 9');
    await userEvent.click(within(form).getByRole('button', { name: 'Ajouter le point' }));

    await waitFor(() =>
      expect(m.createMeetingPoint).toHaveBeenCalledWith({
        city: 'Paris', name: 'Porte de Saint-Cloud', address: 'Place de la Porte de Saint-Cloud, 75016 Paris',
        lat: 48.8378, lng: 2.2567, instructions: null, transit: 'Métro 9',
      }),
    );
    expect(await screen.findByText('Point « Porte de Saint-Cloud » ajouté au catalogue.')).toBeInTheDocument();
  }, 15_000); // beaucoup de frappe : lent sous jsdom

  it('consignes modifiées ; point retiré du catalogue', async () => {
    m.meetingPoints.mockResolvedValue([point()]);
    m.updateMeetingPoint.mockResolvedValue(point({ instructions: 'Devant la sortie 3 du métro' }));
    renderWithProviders(<MeetingPointsPage />);
    const card = (await screen.findByText('Place du 25 Août 1944, 75014 Paris')).closest('li')!;

    await userEvent.click(within(card).getByRole('button', { name: /Modifier les consignes/ }));
    await userEvent.type(within(card).getByLabelText('Consignes d’accès'), 'Devant la sortie 3 du métro');
    await userEvent.click(within(card).getByRole('button', { name: /Enregistrer/ }));
    await waitFor(() => expect(m.updateMeetingPoint).toHaveBeenCalledWith('p1', { instructions: 'Devant la sortie 3 du métro', transit: 'Métro 4, tram T3a' }));

    await userEvent.click(within(card).getByRole('button', { name: /Retirer du catalogue/ }));
    await waitFor(() => expect(m.updateMeetingPoint).toHaveBeenLastCalledWith('p1', { active: false }));
  });
});
