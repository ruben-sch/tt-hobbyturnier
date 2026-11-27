import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Navbar from './Navbar';

describe('Navbar', () => {
  it('shows tournament name, round and connection state', () => {
    render(<Navbar currentTab="standings" setCurrentTab={() => {}} isConnected
      tournament={{ name: 'Sommerturnier', current_round_number: 3, ko_enabled: false }} />);

    expect(screen.getByText('Sommerturnier')).toBeInTheDocument();
    expect(screen.getByText('Runde 3')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'KO-Baum' })).not.toBeInTheDocument();
  });

  it('shows the KO tab only when KO is enabled and switches tabs', async () => {
    const setCurrentTab = vi.fn();
    const user = userEvent.setup();
    render(<Navbar currentTab="monitor" setCurrentTab={setCurrentTab} isConnected={false}
      tournament={{ name: 'X', current_round_number: 0, ko_enabled: true }} />);

    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.queryByText(/^Runde \d/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'KO-Baum' }));
    expect(setCurrentTab).toHaveBeenCalledWith('bracket');
  });

  it('picks the tournament, and on the monitor all running ones', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const tournaments = [
      { id: 3, name: 'Jugend', is_active: true },
      { id: 2, name: 'Hobby', is_active: true, current_round_number: 2 },
      { id: 1, name: 'Vorjahr', is_active: false },
    ];
    const { rerender } = render(<Navbar currentTab="standings" setCurrentTab={() => {}} isConnected
      tournaments={tournaments} tournament={tournaments[1]} selectedId={null} onSelectTournament={onSelect} />);

    const select = screen.getByRole('combobox', { name: 'Turnier wählen' });
    expect(select).toHaveValue('2');
    expect(screen.getByRole('option', { name: 'Vorjahr (abgeschlossen)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Alle laufenden Turniere' })).not.toBeInTheDocument();
    expect(screen.getByText('Runde 2')).toBeInTheDocument();
    await user.selectOptions(select, '1');
    expect(onSelect).toHaveBeenCalledWith(1);

    rerender(<Navbar currentTab="monitor" setCurrentTab={() => {}} isConnected
      tournaments={tournaments} tournament={tournaments[1]} selectedId={null} onSelectTournament={onSelect} />);
    expect(screen.getByRole('combobox', { name: 'Turnier wählen' })).toHaveValue('alle');
    expect(screen.queryByText('Runde 2')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Turnier wählen' }), '3');
    expect(onSelect).toHaveBeenLastCalledWith(3);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Turnier wählen' }), 'alle');
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('falls back to a default title without tournament', () => {
    render(<Navbar currentTab="monitor" setCurrentTab={() => {}} isConnected tournament={null} />);
    expect(screen.getByText('Tischtennis Turnier')).toBeInTheDocument();
  });
});
