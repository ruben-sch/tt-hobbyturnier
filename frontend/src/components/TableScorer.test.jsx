import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TableScorer from './TableScorer';
import * as api from '../services/api';

vi.mock('../services/api', () => ({
  fetchTablesStatus: vi.fn(),
  authenticatePin: vi.fn(),
  fetchMatch: vi.fn(),
  setLineup: vi.fn(),
  submitQuickResult: vi.fn(),
}));

const tournament = { id: 1, name: 'Testturnier' };

const game = (id, order, extra = {}) => ({
  id,
  game_order: order,
  player_a_name: `A${order}`,
  player_b_name: `B${order}`,
  is_completed: false,
  set_scores: [],
  ...extra,
});

const match = {
  id: 42,
  lineup_confirmed: true,
  team_a: { name: 'Team Alpha', player1_name: 'A1', player2_name: 'A2' },
  team_b: { name: 'Team Beta', player1_name: 'B1', player2_name: 'B2' },
  score_a: 0,
  score_b: 0,
  individual_games: [game(101, 1), game(102, 2)],
};

describe('TableScorer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.fetchTablesStatus.mockResolvedValue([]);
    api.fetchMatch.mockResolvedValue(match);
    api.submitQuickResult.mockResolvedValue({});
  });

  it('shows an error for a wrong PIN', async () => {
    api.authenticatePin.mockResolvedValue({ authenticated: false, message: 'Ungültige PIN' });
    const user = userEvent.setup();
    render(<TableScorer tournament={tournament} />);

    await user.type(screen.getByPlaceholderText('z.B. Match-PIN'), '0000');
    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(await screen.findByText('Ungültige PIN')).toBeInTheDocument();
    expect(api.authenticatePin).toHaveBeenCalledWith(1, '0000');
  });

  it('opens the match via PIN, auto-fills set scores and submits them', async () => {
    api.authenticatePin.mockResolvedValue({ authenticated: true, match_id: 42, table_number: null });
    const onScoreChange = vi.fn();
    const user = userEvent.setup();
    render(<TableScorer tournament={tournament} onScoreChange={onScoreChange} />);

    await user.type(screen.getByPlaceholderText('z.B. Match-PIN'), '1234');
    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(await screen.findByText(/Ergebnis eintragen \(A1 vs\. B1\)/)).toBeInTheDocument();

    const set1 = within(screen.getByText('Satz 1').parentElement).getAllByRole('spinbutton');
    const set2 = within(screen.getByText('Satz 2').parentElement).getAllByRole('spinbutton');

    // Loser of set 1 is B with 7 points -> A gets 11
    await user.type(set1[1], '7');
    expect(set1[0]).toHaveValue(11);

    // Deuce in set 2: A loses with 12 -> B gets 14
    await user.type(set2[0], '12');
    expect(set2[1]).toHaveValue(14);

    await user.click(screen.getByRole('button', { name: 'Ergebnis speichern' }));

    expect(api.submitQuickResult).toHaveBeenCalledWith(42, 101, [
      { set_number: 1, score_a: 11, score_b: 7 },
      { set_number: 2, score_a: 12, score_b: 14 },
    ]);
    expect(onScoreChange).toHaveBeenCalled();
  });

  it('lists the running matches and opens one by click', async () => {
    api.fetchTablesStatus.mockResolvedValue([
      { table_number: 1, pin_code: '1001', is_active: true, current_team_match_id: 42,
        team_a_name: 'Team Alpha', team_b_name: 'Team Beta', active_game_desc: 'Einzel 1: A1 vs B2',
        current_point_a: 4, current_point_b: 2 },
      { table_number: 2, pin_code: '1002', is_active: false, current_team_match_id: null },
    ]);
    const user = userEvent.setup();
    render(<TableScorer tournament={tournament} />);

    expect(await screen.findByText('2 Begegnungen')).toBeInTheDocument();
    expect(screen.getByText('Einzel 1: A1 vs B2')).toBeInTheDocument();
    expect(screen.getByText('4 : 2')).toBeInTheDocument();

    await user.click(screen.getByText('Aktuell kein Spiel zugewiesen'));
    expect(api.fetchMatch).not.toHaveBeenCalled();

    await user.click(screen.getByText('Team Alpha vs. Team Beta'));
    expect(await screen.findByText(/Ergebnis eintragen/)).toBeInTheDocument();
    expect(api.fetchMatch).toHaveBeenCalledWith(42);

    await user.click(screen.getByRole('button', { name: /Begegnungsauswahl/ }));
    expect(screen.getByText('2 Begegnungen')).toBeInTheDocument();
  });

  it('opens the match of a table PIN', async () => {
    api.fetchTablesStatus.mockResolvedValue([
      { table_number: 3, pin_code: '1003', is_active: true, current_team_match_id: 42 },
    ]);
    api.authenticatePin.mockResolvedValue({ authenticated: true, role: 'table', table_number: 3, match_id: null });
    const user = userEvent.setup();
    render(<TableScorer tournament={tournament} />);
    await screen.findByText('1 Begegnungen');

    await user.type(screen.getByPlaceholderText('z.B. Match-PIN'), '1003');
    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(await screen.findByText(/Ergebnis eintragen/)).toBeInTheDocument();
    expect(api.fetchMatch).toHaveBeenCalledWith(42);
  });

  it('reports a failing PIN check', async () => {
    api.authenticatePin.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(<TableScorer tournament={tournament} />);

    await user.type(screen.getByPlaceholderText('z.B. Match-PIN'), '1234');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByText('Fehler bei der PIN-Prüfung')).toBeInTheDocument();
  });

  describe('lineup', () => {
    const openMatch = { ...match, lineup_confirmed: false, team_a_p1_name: null, team_a_p2_name: null,
      team_b_p1_name: null, team_b_p2_name: null };

    async function openLineup(user) {
      api.authenticatePin.mockResolvedValue({ authenticated: true, match_id: 42 });
      api.fetchMatch.mockResolvedValue(openMatch);
      render(<TableScorer tournament={tournament} onScoreChange={vi.fn()} />);
      await user.type(screen.getByPlaceholderText('z.B. Match-PIN'), '1234');
      await user.click(screen.getByRole('button', { name: 'Start' }));
      await screen.findByText('Aufstellung festlegen');
    }

    it('swaps positions and confirms the lineup', async () => {
      api.setLineup.mockResolvedValue(match);
      const user = userEvent.setup();
      await openLineup(user);

      const [selectA, selectB] = screen.getAllByRole('combobox');
      await user.selectOptions(selectA, 'A2');
      expect(screen.getByDisplayValue('A1')).toBeDisabled();
      await user.selectOptions(selectB, 'B2');
      await user.selectOptions(selectB, 'B1');

      await user.click(screen.getByRole('button', { name: /Aufstellung bestätigen/ }));
      expect(api.setLineup).toHaveBeenCalledWith(42, {
        team_a_p1_name: 'A2', team_a_p2_name: 'A1', team_b_p1_name: 'B1', team_b_p2_name: 'B2',
      });
      expect(await screen.findByText(/Ergebnis eintragen/)).toBeInTheDocument();
    });

    it('alerts when the lineup cannot be saved and allows going back', async () => {
      api.setLineup.mockRejectedValue(new Error('Server weg'));
      const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const user = userEvent.setup();
      await openLineup(user);

      await user.click(screen.getByRole('button', { name: /Aufstellung bestätigen/ }));
      expect(alert).toHaveBeenCalledWith('Fehler beim Bestätigen der Aufstellung: Server weg');

      await user.click(screen.getByRole('button', { name: /Zurück zur Begegnungsauswahl/ }));
      expect(screen.getByText('Ergebniseingabe')).toBeInTheDocument();
    });
  });

  describe('result entry', () => {
    const played = {
      ...match,
      score_a: 1,
      individual_games: [
        game(101, 1, { is_completed: true, winner_team_side: 'A', sets_won_a: 3, sets_won_b: 0,
          set_scores: [{ set_number: 1, score_a: 11, score_b: 4 }, { set_number: 6, score_a: 1, score_b: 0 }] }),
        game(102, 2),
        game(105, 5, { is_doubles: true }),
      ],
    };

    async function openScorer(user, data = played) {
      api.authenticatePin.mockResolvedValue({ authenticated: true, match_id: 42 });
      api.fetchMatch.mockResolvedValue(data);
      render(<TableScorer tournament={tournament} onScoreChange={vi.fn()} />);
      await user.type(screen.getByPlaceholderText('z.B. Match-PIN'), '1234');
      await user.click(screen.getByRole('button', { name: 'Start' }));
      await screen.findByText(/Ergebnis eintragen/);
    }

    it('starts at the first open game and shows finished games with their sets', async () => {
      const user = userEvent.setup();
      await openScorer(user);

      expect(screen.getByText('Ergebnis eintragen (A2 vs. B2)')).toBeInTheDocument();
      expect(screen.getByText('5. Doppel')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /1\. Einzel/ }));
      expect(screen.getByText('Spiel beendet! Sieger: A1')).toBeInTheDocument();
      const set1 = within(screen.getByText('Satz 1').parentElement).getAllByRole('spinbutton');
      expect(set1[0]).toHaveValue(11);
      expect(set1[1]).toHaveValue(4);
    });

    it('needs at least one set', async () => {
      const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const user = userEvent.setup();
      await openScorer(user);

      await user.click(screen.getByRole('button', { name: 'Ergebnis speichern' }));
      expect(alert).toHaveBeenCalledWith('Bitte mindestens einen Satz eingeben.');
      expect(api.submitQuickResult).not.toHaveBeenCalled();
    });

    it('moves on to the next game after saving', async () => {
      const user = userEvent.setup();
      await openScorer(user);

      const set1 = within(screen.getByText('Satz 1').parentElement).getAllByRole('spinbutton');
      await user.type(set1[1], '5');
      await user.click(screen.getByRole('button', { name: 'Ergebnis speichern' }));

      expect(api.submitQuickResult).toHaveBeenCalledWith(42, 102, [{ set_number: 1, score_a: 11, score_b: 5 }]);
      expect(await screen.findByText('Ergebnis eintragen (A5 vs. B5)')).toBeInTheDocument();
    });

    it('jumps to the first open game after the last one', async () => {
      const user = userEvent.setup();
      await openScorer(user);
      await user.click(screen.getByRole('button', { name: /5\. Doppel/ }));

      const set1 = within(screen.getByText('Satz 1').parentElement).getAllByRole('spinbutton');
      await user.type(set1[0], '9');
      await user.click(screen.getByRole('button', { name: 'Ergebnis speichern' }));

      expect(api.submitQuickResult).toHaveBeenCalledWith(42, 105, [{ set_number: 1, score_a: 9, score_b: 11 }]);
      expect(await screen.findByText('Ergebnis eintragen (A2 vs. B2)')).toBeInTheDocument();
    });

    it('alerts when saving fails', async () => {
      api.submitQuickResult.mockRejectedValue(new Error('Server weg'));
      const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const user = userEvent.setup();
      await openScorer(user);

      const set1 = within(screen.getByText('Satz 1').parentElement).getAllByRole('spinbutton');
      await user.type(set1[1], '5');
      await user.click(screen.getByRole('button', { name: 'Ergebnis speichern' }));
      expect(alert).toHaveBeenCalledWith('Fehler: Server weg');
    });
  });
});
