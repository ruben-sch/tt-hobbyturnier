import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Navbar from './Navbar';

describe('Navbar', () => {
  it('shows tournament name, round and connection state', () => {
    render(<Navbar currentTab="monitor" setCurrentTab={() => {}} isConnected
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
    expect(screen.queryByText(/^Runde/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'KO-Baum' }));
    expect(setCurrentTab).toHaveBeenCalledWith('bracket');
  });

  it('falls back to a default title without tournament', () => {
    render(<Navbar currentTab="monitor" setCurrentTab={() => {}} isConnected tournament={null} />);
    expect(screen.getByText('Tischtennis Turnier')).toBeInTheDocument();
  });
});
