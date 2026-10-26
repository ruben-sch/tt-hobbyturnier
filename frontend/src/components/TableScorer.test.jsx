import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TableScorer from './TableScorer';
import * as api from '../services/api';
import { LiveEventsContext, createLiveEvents } from '../hooks/useLiveEvents';

vi.mock('../services/api', () => ({
  fetchTablesStatus: vi.fn(),
  fetchMatch: vi.fn(),
  submitGameResult: vi.fn(),
}));

const tournament = { id: 1, name: 'Testturnier', best_of_sets: 5 };

const game = (id, order, extra = {}) => ({
  id,
  game_order: order,
  player_a_name: `A${order}`,
  player_b_name: `B${order}`,
  is_completed: false,
  sets_won_a: 0,
  sets_won_b: 0,
  ...extra,
});

const runningTable = {
  table_number: 1, is_active: true, current_team_match_id: 42,
  team_a_name: 'Team Alpha', team_b_name: 'Team Beta', active_game_desc: 'Einzel 1: A1 vs B2',
  match_score_a: 0, match_score_b: 0,
};

// Opens match 42 from the list of running matches.
async function openMatch(user) {
  await user.click(await screen.findByText('Team Alpha vs. Team Beta'));
  await screen.findByText(/Ergebnis eintragen/);
}

const match = {
  id: 42,
  team_a: { name: 'Team Alpha', player1_name: 'A1', player2_name: 'A2' },
  team_b: { name: 'Team Beta', player1_name: 'B1', player2_name: 'B2' },
  score_a: 0,
  score_b: 0,
  individual_games: [game(101, 1), game(102, 2)],
};

describe('TableScorer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.fetchTablesStatus.mockResolvedValue([runningTable]);
    api.fetchMatch.mockResolvedValue(match);
    api.submitGameResult.mockResolvedValue({});
  });

  it('opens a running match and saves the tapped set count', async () => {
    const user = userEvent.setup();
    render(<TableScorer tournament={tournament} />);

    await openMatch(user);

    expect(screen.getByText('Ergebnis eintragen (A1 vs. B1)')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '3:1' }));
    expect(api.submitGameResult).toHaveBeenCalledWith(42, 101, 3, 1);
  });

  it('offers exactly the possible results for best of 5 and best of 3', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<TableScorer tournament={tournament} />);
    await openMatch(user);

    const labels = () => screen.getAllByRole('button', { name: /^\d:\d$/ }).map(b => b.textContent);
    expect(within(screen.getByText('Sieg A1').parentElement).getAllByRole('button').map(b => b.textContent))
      .toEqual(['3:0', '3:1', '3:2']);
    expect(within(screen.getByText('Sieg B1').parentElement).getAllByRole('button').map(b => b.textContent))
      .toEqual(['0:3', '1:3', '2:3']);
    unmount();

    render(<TableScorer tournament={{ ...tournament, best_of_sets: 3 }} />);
    await openMatch(user);
    expect(labels()).toEqual(['2:0', '2:1', '0:2', '1:2']);
  });

  it('refreshes the open match on updates from other devices', async () => {
    const events = createLiveEvents();
    const user = userEvent.setup();
    render(
      <LiveEventsContext.Provider value={events}>
        <TableScorer tournament={tournament} />
      </LiveEventsContext.Provider>
    );

    await openMatch(user);

    // Another device enters a result for game 2 of the same match
    api.fetchMatch.mockResolvedValue({
      ...match,
      score_b: 1,
      individual_games: [game(101, 1), game(102, 2, { is_completed: true, sets_won_b: 3, winner_team_side: 'B' })],
    });
    const fetchesBefore = api.fetchMatch.mock.calls.length;
    await act(async () => {
      events.emit({ type: 'SCORE_UPDATE', match_id: 42 });
    });

    expect(api.fetchMatch.mock.calls.length).toBe(fetchesBefore + 1);
    expect(await screen.findByText('0 : 1')).toBeInTheDocument();
    // The selected game stays where the user was
    expect(screen.getByText('Ergebnis eintragen (A1 vs. B1)')).toBeInTheDocument();

    // Events for other matches don't refetch this one
    await act(async () => {
      events.emit({ type: 'SCORE_UPDATE', match_id: 99 });
    });
    expect(api.fetchMatch.mock.calls.length).toBe(fetchesBefore + 1);
  });

  it('lists the running matches and opens one by click', async () => {
    api.fetchTablesStatus.mockResolvedValue([
      { table_number: 1, is_active: true, current_team_match_id: 42,
        team_a_name: 'Team Alpha', team_b_name: 'Team Beta', active_game_desc: 'Einzel 1: A1 vs B2',
        match_score_a: 2, match_score_b: 1 },
      { table_number: 2, is_active: false, current_team_match_id: null },
    ]);
    const user = userEvent.setup();
    render(<TableScorer tournament={tournament} />);

    expect(await screen.findByText('2 Begegnungen')).toBeInTheDocument();
    expect(screen.getByText('Einzel 1: A1 vs B2')).toBeInTheDocument();
    expect(screen.getByText('2 : 1')).toBeInTheDocument();
    expect(screen.getByText('Tisch 1')).toBeInTheDocument();

    await user.click(screen.getByText('Aktuell kein Spiel zugewiesen'));
    expect(api.fetchMatch).not.toHaveBeenCalled();

    await user.click(screen.getByText('Team Alpha vs. Team Beta'));
    expect(await screen.findByText(/Ergebnis eintragen/)).toBeInTheDocument();
    expect(api.fetchMatch).toHaveBeenCalledWith(42);

    await user.click(screen.getByRole('button', { name: /Begegnungsauswahl/ }));
    expect(screen.getByText('2 Begegnungen')).toBeInTheDocument();
  });

  it('opens a match straight into result entry with the registered order and goes back', async () => {
    const user = userEvent.setup();
    render(<TableScorer tournament={tournament} />);

    await openMatch(user);
    expect(screen.queryByText('Aufstellung festlegen')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Begegnungsauswahl/ }));
    expect(screen.getByText('Ergebniseingabe')).toBeInTheDocument();
  });

  describe('result entry', () => {
    const played = {
      ...match,
      score_a: 1,
      individual_games: [
        game(101, 1, { is_completed: true, winner_team_side: 'A', sets_won_a: 3, sets_won_b: 1 }),
        game(102, 2),
        game(105, 5, { is_doubles: true }),
      ],
    };

    async function openScorer(user, data = played) {
        api.fetchMatch.mockResolvedValue(data);
      render(<TableScorer tournament={tournament} />);
      await openMatch(user);
    }

    it('starts at the first open game and marks the result of finished games', async () => {
      const user = userEvent.setup();
      await openScorer(user);

      expect(screen.getByText('Ergebnis eintragen (A2 vs. B2)')).toBeInTheDocument();
      expect(screen.getByText('5. Doppel')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Ergebnis zurücksetzen' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /1\. Einzel/ }));
      expect(screen.getByText('Spiel beendet! Sieger: A1')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '3:1' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: '3:0' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('moves on to the next game after saving', async () => {
      const user = userEvent.setup();
      await openScorer(user);

      await user.click(screen.getByRole('button', { name: '0:3' }));

      expect(api.submitGameResult).toHaveBeenCalledWith(42, 102, 0, 3);
      expect(await screen.findByText('Ergebnis eintragen (A5 vs. B5)')).toBeInTheDocument();
    });

    it('jumps to the first open game after the last one', async () => {
      const user = userEvent.setup();
      await openScorer(user);
      await user.click(screen.getByRole('button', { name: /5\. Doppel/ }));

      await user.click(screen.getByRole('button', { name: '2:3' }));

      expect(api.submitGameResult).toHaveBeenCalledWith(42, 105, 2, 3);
      expect(await screen.findByText('Ergebnis eintragen (A2 vs. B2)')).toBeInTheDocument();
    });

    it('resets a finished game and stays on it', async () => {
      const user = userEvent.setup();
      await openScorer(user);
      await user.click(screen.getByRole('button', { name: /1\. Einzel/ }));

      await user.click(screen.getByRole('button', { name: 'Ergebnis zurücksetzen' }));

      expect(api.submitGameResult).toHaveBeenCalledWith(42, 101, 0, 0);
      expect(await screen.findByText('Ergebnis eintragen (A1 vs. B1)')).toBeInTheDocument();
    });

    it('alerts when saving fails', async () => {
      api.submitGameResult.mockRejectedValue(new Error('Ungültiges Ergebnis 3:3.'));
      const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const user = userEvent.setup();
      await openScorer(user);

      await user.click(screen.getByRole('button', { name: '3:0' }));
      expect(alert).toHaveBeenCalledWith('Fehler: Ungültiges Ergebnis 3:3.');
    });
  });
});
