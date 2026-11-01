import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RoundHistory from './RoundHistory';
import * as api from '../services/api';

vi.mock('../services/api', () => ({
  fetchRounds: vi.fn(),
}));

const tournament = { id: 4 };

const game = (id, order, a, b, sa, sb) => ({
  id, game_order: order, is_doubles: false, player_a_name: a, player_b_name: b,
  sets_won_a: sa, sets_won_b: sb, is_completed: true,
});

const match = (id, a, b, extra = {}) => ({
  id,
  is_bye: false,
  team_a: { name: a },
  team_b: { name: b },
  team_a_p1_name: `${a}1`,
  team_a_p2_name: `${a}2`,
  team_b_p1_name: `${b}1`,
  team_b_p2_name: `${b}2`,
  table_number: null,
  score_a: 3,
  score_b: 1,
  is_completed: true,
  individual_games: [],
  ...extra,
});

const swiss = (id, number, matches, extra = {}) => ({
  id, round_number: number, round_type: 'swiss', is_completed: true, team_matches: matches, ...extra,
});

describe('RoundHistory', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('explains that no round is completed yet', async () => {
    api.fetchRounds.mockResolvedValue([swiss(1, 1, [], { is_completed: false })]);
    render(<RoundHistory tournament={tournament} />);

    expect(await screen.findByText('Noch keine abgeschlossene Runde')).toBeInTheDocument();
  });

  it('shows the latest completed Swiss round and switches between rounds', async () => {
    const user = userEvent.setup();
    api.fetchRounds.mockResolvedValue([
      swiss(1, 1, [match(1, 'Asse', 'Blocker', {
        table_number: 3,
        individual_games: [game(12, 2, 'Asse2', 'Blocker2', 1, 3), game(11, 1, 'Asse1', 'Blocker1', 3, 0)],
      })]),
      swiss(2, 2, [
        match(2, 'Topspin', 'Konter', { score_a: 2, score_b: 2, table_number: 1, table_number_b: 2 }),
        match(3, 'Netzroller', null, { is_bye: true, team_b: null }),
      ]),
      swiss(3, 3, [match(4, 'Offen', 'Laufend', { is_completed: false })], { is_completed: false }),
      { id: 4, round_number: 4, round_type: 'ko', is_completed: true, team_matches: [] },
    ]);
    render(<RoundHistory tournament={tournament} />);

    expect(await screen.findByRole('tab', { name: 'Runde 2' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Runde 3' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Runde 4' })).not.toBeInTheDocument();
    expect(screen.getByText('1 Begegnungen')).toBeInTheDocument();
    expect(screen.getByText('Tisch 1+2')).toBeInTheDocument();
    expect(screen.getByText('Unentschieden')).toBeInTheDocument();
    expect(screen.getByText('Freilos')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Runde 1' }));
    const card = screen.getByTestId('history-match');
    expect(within(card).getByText('Tisch 3')).toBeInTheDocument();
    expect(within(card).getByText('Asse')).toHaveClass('text-emerald-400');
    expect(within(card).getByText('Beendet')).toBeInTheDocument();
    const games = within(card).getAllByTestId('history-game');
    expect(games[0]).toHaveTextContent('E1Asse13:0Blocker1');
    expect(games[1]).toHaveTextContent('E2Asse21:3Blocker2');
    expect(within(games[1]).getByText('Blocker2')).toHaveClass('text-emerald-300');
  });

  it('labels matches without tables by their number and shows open games and doubles', async () => {
    api.fetchRounds.mockResolvedValue([swiss(1, 1, [match(1, 'Asse', 'Blocker', {
      individual_games: [
        { ...game(1, 5, 'A', 'B', 0, 0), is_doubles: true, is_completed: false },
      ],
    })])]);
    render(<RoundHistory tournament={tournament} />);

    expect(await screen.findByText('Spiel 1')).toBeInTheDocument();
    expect(screen.getByTestId('history-game')).toHaveTextContent('DA–B');
  });

  it('logs load errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.fetchRounds.mockRejectedValue(new Error('down'));
    render(<RoundHistory tournament={tournament} />);

    expect(await screen.findByText('Noch keine abgeschlossene Runde')).toBeInTheDocument();
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    spy.mockRestore();
  });
});
