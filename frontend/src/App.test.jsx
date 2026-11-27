import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import * as api from './services/api';
import { useWebSocket } from './hooks/useWebSocket';

vi.mock('./services/api', () => ({
  fetchTournaments: vi.fn(),
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
    default: ({ tournament, tournaments }) => (
      <div>{`${name}: ${tournaments ? tournaments.map((t) => t.name).join('+') || '-' : tournament?.name ?? '-'}`}</div>
    ),
  }),
}));
vi.mock('./components/HallenMonitor', () => stub('HallenMonitor'));
vi.mock('./components/TableScorer', () => stub('TableScorer'));
vi.mock('./components/StandingsTable', () => stub('StandingsTable'));
vi.mock('./components/KOBracket', () => stub('KOBracket'));
vi.mock('./components/RoundHistory', () => stub('RoundHistory'));
vi.mock('./components/AdminDashboard', () => stub('AdminDashboard'));
vi.mock('./components/PrintableSheets', () => stub('PrintableSheets'));
vi.mock('./components/AdminPinPrompt', () => ({
  default: ({ title = 'Turnierleitung' }) => <div>{`AdminPinPrompt ${title}`}</div>,
}));
vi.mock('./components/TournamentOverview', () => ({
  default: ({ tournaments, onOpen }) => (
    <div>
      {`TournamentOverview: ${(tournaments || []).map((t) => t.name).join('+')}`}
      {(tournaments || []).map((t) => (
        <button key={t.id} type="button" onClick={() => onOpen(t.id, 'standings')}>{`Öffne ${t.name}`}</button>
      ))}
    </div>
  ),
}));

const tournament = { id: 1, name: 'Sommerturnier', current_round_number: 0, ko_enabled: true, is_active: true };

describe('App', () => {
  let onWsMessage;
  let pinListener;

  beforeEach(() => {
    vi.resetAllMocks();
    window.history.replaceState(null, '', '/');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    api.fetchTournaments.mockResolvedValue([tournament]);
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

  it('opens the tab from a QR code link', async () => {
    window.history.pushState({}, '', '/?tab=standings');
    try {
      render(<App />);
      expect(await screen.findByText('StandingsTable: Sommerturnier')).toBeInTheDocument();
    } finally {
      window.history.pushState({}, '', '/');
    }
  });

  it('loads the tournament and switches tabs', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText('HallenMonitor: Sommerturnier')).toBeInTheDocument();

    const tabs = [
      
      ['Tabelle', 'StandingsTable'],
      ['Runden', 'RoundHistory'],
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
    expect(screen.getByText('AdminPinPrompt Turnierleitung')).toBeInTheDocument();

    act(() => pinListener('4711'));
    expect(screen.getByText('AdminDashboard: Sommerturnier')).toBeInTheDocument();

    act(() => pinListener(null));
    expect(screen.getByText('AdminPinPrompt Turnierleitung')).toBeInTheDocument();
  });

  it('opens the result entry only with the admin PIN', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('HallenMonitor: Sommerturnier');

    await user.click(screen.getByRole('button', { name: 'Ergebniseingabe' }));
    expect(screen.getByText('AdminPinPrompt Ergebniseingabe')).toBeInTheDocument();

    act(() => pinListener('4711'));
    expect(screen.getByText('TableScorer: Sommerturnier')).toBeInTheDocument();
  });

  it('drops a remembered PIN that the server no longer accepts', async () => {
    api.getAdminPin.mockReturnValue('alt');
    api.verifyAdminPin.mockResolvedValue(false);
    render(<App />);
    await screen.findByText('HallenMonitor: Sommerturnier');

    await vi.waitFor(() => expect(api.setAdminPin).toHaveBeenCalledWith(null));
    expect(api.verifyAdminPin).toHaveBeenCalledWith('alt');
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
    expect(api.fetchTournaments).toHaveBeenCalledTimes(1);

    api.fetchTournaments.mockResolvedValue([{ ...tournament, name: 'Umbenannt' }]);
    await act(async () => onWsMessage({ type: 'SCORE_UPDATE' }));
    expect(api.fetchTournaments).toHaveBeenCalledTimes(1);

    await act(async () => onWsMessage({ type: 'TOURNAMENT_UPDATED' }));
    expect(await screen.findByText('HallenMonitor: Umbenannt')).toBeInTheDocument();
    expect(api.fetchTournaments).toHaveBeenCalledTimes(2);

    await act(async () => onWsMessage({ type: 'TOURNAMENT_CREATED' }));
    expect(api.fetchTournaments).toHaveBeenCalledTimes(3);
  });

  it('survives a failing tournament request', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.fetchTournaments.mockRejectedValue(new Error('offline'));
    render(<App />);

    expect(await screen.findByText('HallenMonitor: -')).toBeInTheDocument();
    expect(screen.getByText('Tischtennis Turnier')).toBeInTheDocument();
  });

  describe('several tournaments', () => {
    const hobby = { id: 1, name: 'Hobby', is_active: true, current_round_number: 2 };
    const jugend = { id: 2, name: 'Jugend', is_active: true, current_round_number: 1 };
    const vorjahr = { id: 3, name: 'Vorjahr', is_active: false, current_round_number: 5 };

    beforeEach(() => {
      api.fetchTournaments.mockResolvedValue([vorjahr, jugend, hobby]);
    });
    afterEach(() => {
      window.history.replaceState(null, '', '/');
    });

    it('shows every running tournament on the monitor and in result entry, the newest elsewhere', async () => {
      api.getAdminPin.mockReturnValue('4711');
      api.verifyAdminPin.mockResolvedValue(true);
      const user = userEvent.setup();
      render(<App />);

      expect(await screen.findByText('HallenMonitor: Jugend+Hobby')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Ergebniseingabe' }));
      expect(screen.getByText('TableScorer: Jugend+Hobby')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Tabelle' }));
      expect(screen.getByText('StandingsTable: Jugend')).toBeInTheDocument();
      expect(window.location.search).toBe('?tab=standings');
    });

    it('switches the tournament in the navigation and keeps it in the URL', async () => {
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText('HallenMonitor: Jugend+Hobby');

      await user.selectOptions(screen.getByRole('combobox', { name: 'Turnier wählen' }), '1');
      expect(screen.getByText('HallenMonitor: Hobby')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Runden' }));
      expect(screen.getByText('RoundHistory: Hobby')).toBeInTheDocument();
      expect(window.location.search).toBe('?tab=history&turnier=1');

      await user.click(screen.getByRole('button', { name: 'Hallen-Monitor' }));
      await user.selectOptions(screen.getByRole('combobox', { name: 'Turnier wählen' }), 'alle');
      expect(screen.getByText('HallenMonitor: Jugend+Hobby')).toBeInTheDocument();
    });

    it('opens a tournament from the start page and from a link', async () => {
      window.history.replaceState(null, '', '/?tab=start');
      const user = userEvent.setup();
      const { unmount } = render(<App />);

      expect(await screen.findByText('TournamentOverview: Vorjahr+Jugend+Hobby')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Öffne Vorjahr' }));
      expect(screen.getByText('StandingsTable: Vorjahr')).toBeInTheDocument();
      unmount();

      window.history.replaceState(null, '', '/?tab=monitor&turnier=2');
      render(<App />);
      expect(await screen.findByText('HallenMonitor: Jugend')).toBeInTheDocument();
    });

    it('falls back to the newest tournament when none runs', async () => {
      api.fetchTournaments.mockResolvedValue([vorjahr]);
      render(<App />);
      expect(await screen.findByText('HallenMonitor: Vorjahr')).toBeInTheDocument();
    });
  });
});
