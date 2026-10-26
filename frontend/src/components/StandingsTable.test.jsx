import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StandingsTable from './StandingsTable';
import * as api from '../services/api';
import { standingsRow } from '../test/fixtures';

vi.mock('../services/api', () => ({
  fetchStandings: vi.fn(),
}));

const tournament = { id: 7 };

describe('StandingsTable', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders the standings with signed differences', async () => {
    api.fetchStandings.mockResolvedValue([
      standingsRow(1, 'Asse'),
      standingsRow(2, 'Blocker', { set_diff: -3 }),
      standingsRow(3, 'Chopper', { set_diff: 0 }),
    ]);
    render(<StandingsTable tournament={tournament} />);

    expect(await screen.findByText('Asse')).toBeInTheDocument();
    expect(api.fetchStandings).toHaveBeenCalledWith(7);
    expect(screen.getByText('(+5)')).toBeInTheDocument();
    expect(screen.getByText('(-3)')).toBeInTheDocument();
    expect(screen.getByText('(0)')).toBeInTheDocument();
    expect(screen.queryByText('Bälle')).not.toBeInTheDocument();
  });

  it('filters by team and player name', async () => {
    api.fetchStandings.mockResolvedValue([standingsRow(1, 'Asse'), standingsRow(2, 'Blocker')]);
    const user = userEvent.setup();
    render(<StandingsTable tournament={tournament} />);
    await screen.findByText('Asse');

    const search = screen.getByPlaceholderText('Team oder Spieler suchen...');
    await user.type(search, 'xyz');
    expect(screen.getByText('Keine Einträge gefunden.')).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'BLOCK');
    expect(screen.getByText('Blocker')).toBeInTheDocument();
    expect(screen.queryByText('Asse')).not.toBeInTheDocument();
  });

  it('opens the CSV export', async () => {
    api.fetchStandings.mockResolvedValue([]);
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const user = userEvent.setup();
    render(<StandingsTable tournament={tournament} />);

    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    expect(open).toHaveBeenCalledWith('/api/tournaments/7/export/csv', '_blank');
  });

  it('opens the PDF archive', async () => {
    api.fetchStandings.mockResolvedValue([]);
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const user = userEvent.setup();
    render(<StandingsTable tournament={tournament} />);

    await user.click(screen.getByRole('button', { name: /PDF-Archiv/ }));
    expect(open).toHaveBeenCalledWith('/api/tournaments/7/export/pdf', '_blank');
  });

  it('shows an empty table when loading fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.fetchStandings.mockRejectedValue(new Error('offline'));
    render(<StandingsTable tournament={tournament} />);

    expect(await screen.findByText('Keine Einträge gefunden.')).toBeInTheDocument();
  });
});
