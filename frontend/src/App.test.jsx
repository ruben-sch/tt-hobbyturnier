import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import * as api from './services/api';
import { useWebSocket } from './hooks/useWebSocket';

vi.mock('./services/api', () => ({
  fetchActiveTournament: vi.fn(),
  getAdminPin: vi.fn(),
  setAdminPin: vi.fn(),
  subscribeAdminPin: vi.fn(),
  verifyAdminPin: vi.fn(),
}));

vi.mock('./hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(),
}));

// Stub the views: App is only responsible for choosing and refreshing them.
const { stub } = vi.hoisted(() => ({
  stub: (name) => ({
    default: ({ tournament }) => <div>{`${name}: ${tournament?.name ?? '-'}`}</div>,
  }),
}));
vi.mock('./components/HallenMonitor', () => stub('HallenMonitor'));
vi.mock('./components/TableScorer', () => ({
  default: ({ tournament, initialMatchId }) => (
    <div>{`TableScorer: ${tournament?.name ?? '-'}${initialMatchId ? ` ${initialMatchId}` : ''}`}</div>
  ),
}));
vi.mock('./components/StandingsTable', () => stub('StandingsTable'));
vi.mock('./components/KOBracket', () => stub('KOBracket'));
vi.mock('./components/AdminDashboard', () => stub('AdminDashboard'));
vi.mock('./components/PrintableSheets', () => stub('PrintableSheets'));
vi.mock('./components/AdminPinPrompt', () => stub('AdminPinPrompt'));

const tournament = { id: 1, name: 'Sommerturnier', current_round_number: 0, ko_enabled: true };

describe('App', () => {
  let onWsMessage;
  let pinListener;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    api.fetchActiveTournament.mockResolvedValue(tournament);
    api.getAdminPin.mockReturnValue(null);
    api.subscribeAdminPin.mockImplementation((cb) => {
      pinListener = cb;
      return () => {};
    });
    useWebSocket.mockImplementation((cb) => {
      onWsMessage = cb;
      return { isConnected: true };
    });
  });

  it('opens the tab and match from a QR code link', async () => {
    window.history.pushState({}, '', '/?tab=scorer&match=21');
    try {
      render(<App />);
      expect(await screen.findByText('TableScorer: Sommerturnier 21')).toBeInTheDocument();
    } finally {
      window.history.pushState({}, '', '/');
    }
  });

  it('loads the tournament and switches tabs', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText('HallenMonitor: Sommerturnier')).toBeInTheDocument();

    const tabs = [
      ['Ergebniseingabe', 'TableScorer'],
      ['Tabelle', 'StandingsTable'],
      ['KO-Baum', 'KOBracket'],
      ['Spielzettel', 'PrintableSheets'],
    ];
    for (const [label, view] of tabs) {
      await user.click(screen.getByRole('button', { name: label }));
      expect(screen.getByText(`${view}: Sommerturnier`)).toBeInTheDocument();
    }
  });

  it('asks for the admin PIN until one is set', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('HallenMonitor: Sommerturnier');

    await user.click(screen.getByRole('button', { name: 'Turnierleitung' }));
    expect(screen.getByText('AdminPinPrompt: Sommerturnier')).toBeInTheDocument();

    act(() => pinListener('4711'));
    expect(screen.getByText('AdminDashboard: Sommerturnier')).toBeInTheDocument();

    act(() => pinListener(null));
    expect(screen.getByText('AdminPinPrompt: Sommerturnier')).toBeInTheDocument();
  });

  it('drops a remembered PIN that the server no longer accepts', async () => {
    api.getAdminPin.mockReturnValue('alt');
    api.verifyAdminPin.mockResolvedValue(false);
    render(<App />);
    await screen.findByText('HallenMonitor: Sommerturnier');

    await vi.waitFor(() => expect(api.setAdminPin).toHaveBeenCalledWith(null));
    expect(api.verifyAdminPin).toHaveBeenCalledWith(1, 'alt');
  });

  it('keeps a remembered PIN that is still valid', async () => {
    api.getAdminPin.mockReturnValue('4711');
    api.verifyAdminPin.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('HallenMonitor: Sommerturnier');

    await user.click(screen.getByRole('button', { name: 'Turnierleitung' }));
    expect(screen.getByText('AdminDashboard: Sommerturnier')).toBeInTheDocument();
    expect(api.setAdminPin).not.toHaveBeenCalled();
  });

  it('reloads the tournament on tournament WebSocket events only', async () => {
    render(<App />);
    await screen.findByText('HallenMonitor: Sommerturnier');
    expect(api.fetchActiveTournament).toHaveBeenCalledTimes(1);

    api.fetchActiveTournament.mockResolvedValue({ ...tournament, name: 'Umbenannt' });
    await act(async () => onWsMessage({ type: 'SCORE_UPDATE' }));
    expect(api.fetchActiveTournament).toHaveBeenCalledTimes(1);

    await act(async () => onWsMessage({ type: 'TOURNAMENT_UPDATED' }));
    expect(await screen.findByText('HallenMonitor: Umbenannt')).toBeInTheDocument();
    expect(api.fetchActiveTournament).toHaveBeenCalledTimes(2);
  });

  it('survives a failing tournament request', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.fetchActiveTournament.mockRejectedValue(new Error('offline'));
    render(<App />);

    expect(await screen.findByText('HallenMonitor: -')).toBeInTheDocument();
    expect(screen.getByText('Tischtennis Turnier')).toBeInTheDocument();
  });
});
