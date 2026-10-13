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
});
