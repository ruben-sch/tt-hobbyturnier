import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KOBracket from './KOBracket';
import * as api from '../services/api';

vi.mock('../services/api', () => ({
  fetchRounds: vi.fn(),
  advanceKoRound: vi.fn(),
}));

const tournament = { id: 4 };

const koMatch = (id, a, b, extra = {}) => ({
  id,
  ko_slot: id,
  match_pin: null,
  team_a: { name: a },
  team_b: { name: b },
  team_a_p1_name: `${a}1`,
  team_a_p2_name: `${a}2`,
  team_b_p1_name: `${b}1`,
  team_b_p2_name: `${b}2`,
  score_a: 3,
  score_b: 1,
  is_completed: true,
  individual_games: [],
  ...extra,
});

const semis = {
  id: 2,
  round_number: 2,
  round_type: 'ko',
  ko_stage: 'Halbfinale',
  team_matches: [
    koMatch(1, 'Asse', 'Blocker'),
    koMatch(2, 'Topspin', 'Konter', { score_a: 2, score_b: 3, individual_games: [{ is_doubles: true }] }),
  ],
};

describe('KOBracket', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('explains how to start when there is no KO round', async () => {
    api.fetchRounds.mockResolvedValue([{ id: 1, round_type: 'swiss', team_matches: [] }]);
    render(<KOBracket tournament={tournament} isAdmin />);

    expect(await screen.findByText('Die KO-Runde wurde noch nicht gestartet')).toBeInTheDocument();
  });

  it('shows stages, winners and the deciding doubles badge', async () => {
    api.fetchRounds.mockResolvedValue([semis]);
    render(<KOBracket tournament={tournament} isAdmin={false} />);

    expect(await screen.findByText('Halbfinale')).toBeInTheDocument();
    expect(screen.getByText('2 Begegnungen')).toBeInTheDocument();
    expect(screen.getByText('Asse')).toHaveClass('text-emerald-400');
    expect(screen.getByText('Konter')).toHaveClass('text-emerald-400');
    expect(screen.getByText('Topspin')).toHaveClass('text-slate-100');
    expect(screen.getByText('Entscheidungsdoppel!')).toBeInTheDocument();
    expect(screen.getAllByText('Beendet')).toHaveLength(2);
    // Only admins may advance
    expect(screen.queryByRole('button', { name: /Folgerunde starten/ })).not.toBeInTheDocument();
  });

  it('lets the admin start the final once all semifinals are done', async () => {
    api.fetchRounds.mockResolvedValue([semis]);
    api.advanceKoRound.mockResolvedValue({});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onRoundChange = vi.fn();
    const user = userEvent.setup();
    render(<KOBracket tournament={tournament} isAdmin onRoundChange={onRoundChange} />);

    await user.click(await screen.findByRole('button', { name: /Folgerunde starten \(Finale\)/ }));

    expect(api.advanceKoRound).toHaveBeenCalledWith(4);
    expect(api.fetchRounds).toHaveBeenCalledTimes(2);
    expect(onRoundChange).toHaveBeenCalled();
  });

  it('does nothing when the admin cancels, and alerts on errors', async () => {
    const quarters = { ...semis, ko_stage: 'Viertelfinale' };
    api.fetchRounds.mockResolvedValue([quarters]);
    api.advanceKoRound.mockRejectedValue(new Error('Noch offen'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<KOBracket tournament={tournament} isAdmin />);

    const button = await screen.findByRole('button', { name: /Folgerunde starten \(Halbfinale\)/ });
    await user.click(button);
    expect(api.advanceKoRound).not.toHaveBeenCalled();

    await user.click(button);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(alert).toHaveBeenCalledWith('Fehler: Noch offen');
  });

  it('hides the advance button while matches are running or after the final', async () => {
    const running = { ...semis, team_matches: [semis.team_matches[0], koMatch(2, 'X', 'Y', { is_completed: false })] };
    const final = { id: 3, round_number: 3, round_type: 'ko', ko_stage: 'Finale', team_matches: [koMatch(5, 'Asse', 'Konter', { match_pin: '0142' })] };

    api.fetchRounds.mockResolvedValue([running]);
    const { unmount } = render(<KOBracket tournament={tournament} isAdmin />);
    await screen.findByText('Halbfinale');
    expect(screen.queryByRole('button', { name: /Folgerunde/ })).not.toBeInTheDocument();
    unmount();

    api.fetchRounds.mockResolvedValue([semis, final]);
    render(<KOBracket tournament={tournament} isAdmin />);
    expect(await screen.findByText('PIN: 0142')).toBeInTheDocument();
    expect(screen.getByText('1 Finale')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Folgerunde/ })).not.toBeInTheDocument();
  });
});
