import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PrintableSheets from './PrintableSheets';
import * as api from '../services/api';

vi.mock('../services/api', () => ({
  fetchRounds: vi.fn(),
}));

const tournament = { id: 5, name: 'Sommerturnier' };

const game = (order, sets_won_a, sets_won_b) => ({ id: order, game_order: order, sets_won_a, sets_won_b });

const team = (name) => ({ name, player1_name: `${name} Eins`, player2_name: `${name} Zwei` });

const rounds = [
  {
    id: 1, round_number: 1, round_type: 'swiss', is_active: false,
    team_matches: [{
      id: 11, team_a_id: 1, team_b_id: 2, team_a: team('Asse'), team_b: team('Blocker'),
      is_completed: true, score_a: 3, score_b: 1,
      individual_games: [game(1, 3, 0), game(2, 3, 1), game(3, 0, 3), game(4, 3, 2)],
    }],
  },
  {
    id: 2, round_number: 2, round_type: 'ko', ko_stage: 'Finale', is_active: true,
    team_matches: [
      {
        id: 21, team_a_id: 1, team_b_id: 3, team_a: team('Asse'), team_b: team('Topspin'),
        team_a_p1_name: 'Anna', is_completed: false, score_a: 0, score_b: 0, individual_games: [],
      },
      { id: 22, team_a_id: 4, team_b_id: null, is_bye: true, team_a: team('Freilos'), individual_games: [] },
    ],
  },
];

describe('PrintableSheets', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.fetchRounds.mockResolvedValue(rounds);
  });

  it('preselects the active round and skips byes', async () => {
    render(<PrintableSheets tournament={tournament} />);

    expect(await screen.findByText(/Runde 2 \(Finale\)/, { selector: 'option' })).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('2');
    expect(screen.getByText('Topspin')).toBeInTheDocument();
    expect(screen.getByText('1: Anna')).toBeInTheDocument();
    expect(screen.getByText('2: Asse Zwei')).toBeInTheDocument();
    expect(screen.queryByText('Freilos')).not.toBeInTheDocument();
  });

  it('switches rounds and shows recorded set counts per game, without points or total', async () => {
    const user = userEvent.setup();
    render(<PrintableSheets tournament={tournament} />);
    await screen.findByText('Topspin');

    await user.selectOptions(screen.getByRole('combobox'), '1');
    expect(screen.getByText('Blocker')).toBeInTheDocument();
    expect(screen.getAllByRole('row').slice(1).map(r => r.lastChild.textContent))
      .toEqual(['3 : 0', '3 : 1', '0 : 3', '3 : 2']);
    expect(screen.queryByText('Punkte')).not.toBeInTheDocument();
    expect(screen.queryByText(/GESAMTERGEBNIS/)).not.toBeInTheDocument();
  });

  it('adds the deciding doubles row only in KO rounds', async () => {
    const user = userEvent.setup();
    render(<PrintableSheets tournament={tournament} />);

    expect(await screen.findByText('Doppel (nur bei 2:2)')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox'), '1');
    expect(screen.queryByText('Doppel (nur bei 2:2)')).not.toBeInTheDocument();
  });

  it('puts four sheets on each page', async () => {
    const matches = Array.from({ length: 5 }, (_, i) => ({
      id: 100 + i, team_a_id: 1, team_b_id: 2, team_a: team(`A${i}`), team_b: team(`B${i}`), individual_games: [],
    }));
    api.fetchRounds.mockResolvedValue([{ id: 3, round_number: 1, round_type: 'swiss', is_active: true, team_matches: matches }]);
    const { container } = render(<PrintableSheets tournament={tournament} />);

    expect(await screen.findByText('BEGEGNUNG #5')).toBeInTheDocument();
    const pages = container.querySelectorAll('.break-after-page');
    expect([...pages].map(p => p.children.length)).toEqual([4, 1]);
  });

  it('has neither match PIN nor QR code', async () => {
    const { container } = render(<PrintableSheets tournament={tournament} />);

    await screen.findByText('BEGEGNUNG #1');
    expect(screen.queryByText(/PIN/)).not.toBeInTheDocument();
    expect(container.querySelector('svg[data-testid="sheet-qr"]')).toBeNull();
  });

  it('prints the page', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<PrintableSheets tournament={tournament} />);

    await user.click(screen.getByRole('button', { name: /Jetzt drucken/ }));
    expect(print).toHaveBeenCalled();
  });
});
