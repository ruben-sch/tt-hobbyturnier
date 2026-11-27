import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TournamentOverview from './TournamentOverview';
import * as api from '../services/api';

vi.mock('../services/api', () => ({
  createTournament: vi.fn(),
}));

const tournaments = [
  { id: 3, name: 'Jugend', is_active: true, current_round_number: 0, is_singles: true, best_of_sets: 3 },
  { id: 2, name: 'Hobby', is_active: true, current_round_number: 2 },
  { id: 1, name: 'Vorjahr', is_active: false, current_round_number: 5, created_at: '2025-11-01T09:00:00' },
];

describe('TournamentOverview', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows a loading state', () => {
    render(<TournamentOverview tournaments={null} onOpen={() => {}} />);
    expect(screen.getByText('Lade Turniere...')).toBeInTheDocument();
  });

  it('lets players open the live scores or standings of their class', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<TournamentOverview tournaments={tournaments} onOpen={onOpen} />);

    const cards = screen.getAllByTestId('tournament-card');
    expect(cards.map((c) => within(c).getByText(/Jugend|Hobby/).textContent)).toEqual(['Jugend', 'Hobby']);
    expect(within(cards[0]).getByText('Noch keine Runde')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Runde 2')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Einzel · 2 Gewinnsätze')).toBeInTheDocument();
    expect(within(cards[1]).getByText('2er-Teams · 3 Gewinnsätze')).toBeInTheDocument();

    await user.click(within(cards[1]).getByRole('button', { name: 'Live-Spielstände' }));
    expect(onOpen).toHaveBeenCalledWith(2, 'monitor');
    await user.click(within(cards[0]).getByRole('button', { name: 'Tabelle' }));
    expect(onOpen).toHaveBeenCalledWith(3, 'standings');

    // History, and no admin form without the PIN
    expect(screen.getByText('Abgeschlossene Turniere')).toBeInTheDocument();
    expect(screen.getByText(/1\.11\.2025/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ansehen' }));
    expect(onOpen).toHaveBeenCalledWith(1, 'standings');
    expect(screen.queryByLabelText(/Neues Turnier/)).not.toBeInTheDocument();
  });

  it('says when nothing runs', () => {
    render(<TournamentOverview tournaments={[tournaments[2]]} onOpen={() => {}} />);
    expect(screen.getByText('Aktuell läuft kein Turnier.')).toBeInTheDocument();
  });

  it('lets the Turnierleitung create another tournament', async () => {
    api.createTournament.mockResolvedValue({ id: 4, name: 'Damen' });
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<TournamentOverview tournaments={tournaments.slice(0, 2)} isAdmin onOpen={onOpen} />);
    expect(screen.queryByText('Abgeschlossene Turniere')).not.toBeInTheDocument();

    const button = screen.getByRole('button', { name: /Anlegen/ });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/Neues Turnier/), '  Damen ');
    await user.click(button);

    expect(api.createTournament).toHaveBeenCalledWith({ name: 'Damen', is_singles: false, best_of_sets: 5 });
    expect(onOpen).toHaveBeenCalledWith(4, 'admin');
    expect(screen.getByLabelText(/Neues Turnier/)).toHaveValue('');
  });

  it('creates an Einzelturnier with its Gewinnsätze', async () => {
    api.createTournament.mockResolvedValue({ id: 5, name: 'Einzel' });
    const user = userEvent.setup();
    render(<TournamentOverview tournaments={tournaments} isAdmin onOpen={() => {}} />);

    await user.type(screen.getByLabelText(/Neues Turnier/), 'Einzel');
    await user.selectOptions(screen.getByLabelText('Spielform'), 'singles');
    await user.selectOptions(screen.getByLabelText('Gewinnsätze'), '3');
    await user.click(screen.getByRole('button', { name: /Anlegen/ }));

    expect(api.createTournament).toHaveBeenCalledWith({ name: 'Einzel', is_singles: true, best_of_sets: 3 });
    expect(screen.getByLabelText('Spielform')).toHaveValue('teams');
  });

  it('reports a failed creation', async () => {
    api.createTournament.mockRejectedValue(new Error('Falsche Admin-PIN.'));
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<TournamentOverview tournaments={tournaments} isAdmin onOpen={() => {}} />);

    await user.type(screen.getByLabelText(/Neues Turnier/), 'Damen');
    await user.click(screen.getByRole('button', { name: /Anlegen/ }));
    expect(alert).toHaveBeenCalledWith('Fehler: Falsche Admin-PIN.');
  });
});
