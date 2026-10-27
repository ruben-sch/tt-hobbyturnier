import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HallenMonitor from './HallenMonitor';
import * as api from '../services/api';
import { standingsRow } from '../test/fixtures';

vi.mock('../services/api', () => ({
  fetchMonitorDashboard: vi.fn(),
  fetchServerInfo: vi.fn(),
}));

// Render the encoded link as text so tests can check where the QR code points.
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value, title }) => <div title={title}>{value}</div>,
}));

const tournament = { id: 3 };

const runningMatch = {
  match_id: 11,
  team_a_name: 'Asse',
  team_b_name: 'Blocker',
  active_game_desc: 'Einzel 2: Anna vs Ben',
  score_a: 1,
  score_b: 0,
  is_completed: false,
};

const finishedMatch = {
  match_id: 12,
  team_a_name: 'Chopper',
  team_b_name: 'Drive',
  active_game_desc: '',
  score_a: 2,
  score_b: 2,
  is_completed: true,
};

const swissData = {
  tournament_name: 'Sommerturnier',
  current_round: 2,
  round_type: 'swiss',
  ko_stage: null,
  matches: [runningMatch, finishedMatch],
  standings: [standingsRow(1, 'Asse'), standingsRow(2, 'Blocker', { set_diff: -2 })],
  ticker: [{ id: 9, round_number: 1, team_a: 'Asse', team_b: 'Blocker', score: '3:1' }],
  ko_tree: [],
};

describe('HallenMonitor', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.fetchServerInfo.mockResolvedValue({ lan_url: 'http://192.168.8.10:8000' });
  });

  it('shows a loading state until data arrives', () => {
    api.fetchMonitorDashboard.mockReturnValue(new Promise(() => {}));
    render(<HallenMonitor tournament={tournament} />);
    expect(screen.getByText('Lade Hallen-Monitor Daten...')).toBeInTheDocument();
  });

  it('shows live tables, standings and ticker in split mode', async () => {
    api.fetchMonitorDashboard.mockResolvedValue(swissData);
    render(<HallenMonitor tournament={tournament} />);

    expect(await screen.findByText('SOMMERTURNIER', { exact: false })).toBeInTheDocument();
    expect(api.fetchMonitorDashboard).toHaveBeenCalledWith(3);
    expect(screen.getByText(/Runde 2/)).toBeInTheDocument();
    expect(screen.getByText('1 aktive Paarungen')).toBeInTheDocument();
    expect(screen.getByText('Einzel 2: Anna vs Ben')).toBeInTheDocument();
    // The match score is the live number; there are no set points any more
    expect(screen.getByText('1 : 0')).toBeInTheDocument();
    expect(screen.queryByText(/Satzstand/)).not.toBeInTheDocument();
    expect(screen.getByText('Aktuelle Tabelle')).toBeInTheDocument();
    expect(screen.getByText('-2')).toBeInTheDocument();
    expect(screen.getByText('R1:')).toBeInTheDocument();
    expect(screen.getByText('3:1')).toBeInTheDocument();
  });

  it('keeps finished matches of the round and marks them as done', async () => {
    api.fetchMonitorDashboard.mockResolvedValue(swissData);
    const user = userEvent.setup();
    render(<HallenMonitor tournament={tournament} />);

    const check = () => {
      const [running, finished] = screen.getAllByTestId('monitor-match');
      expect(running).toHaveAttribute('data-completed', 'false');
      expect(running).toHaveTextContent('Einzel 2: Anna vs Ben');
      expect(running).not.toHaveTextContent('Fertig');
      expect(finished).toHaveAttribute('data-completed', 'true');
      expect(finished).toHaveClass('opacity-60', 'border-emerald-500/70');
      expect(finished).toHaveTextContent('Chopper');
      expect(finished).toHaveTextContent('Fertig');
      expect(finished).toHaveTextContent('2 : 2');
    };

    expect(await screen.findByText('1 aktive Paarungen')).toBeInTheDocument();
    check();
    await user.click(screen.getByRole('button', { name: 'Aktuelle Paarungen' }));
    check();
  });

  it('shows a QR code that opens the live scores', async () => {
    api.fetchMonitorDashboard.mockResolvedValue(swissData);
    render(<HallenMonitor tournament={tournament} />);

    expect(await screen.findByTitle('QR-Code zur Spielstandsanzeige'))
      .toHaveTextContent('http://192.168.8.10:8000/?tab=monitor');
    expect(screen.getByText('192.168.8.10:8000')).toBeInTheDocument();
  });

  it('switches to the single views', async () => {
    api.fetchMonitorDashboard.mockResolvedValue({ ...swissData, matches: [], ticker: [] });
    const user = userEvent.setup();
    render(<HallenMonitor tournament={tournament} />);

    expect(await screen.findByText('Aktuell keine laufenden Begegnungen.')).toBeInTheDocument();
    expect(screen.getByText('Noch keine Spiele abgeschlossen.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Nur Tabelle' }));
    expect(screen.getByText('Gesamttabelle Schweizer System')).toBeInTheDocument();
    expect(screen.getAllByText('1S - 0U - 1N', { exact: false })).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Aktuelle Paarungen' }));
    expect(screen.getByText('Laufende Begegnungen & Spielstände')).toBeInTheDocument();
    expect(screen.queryByText('Gesamttabelle Schweizer System')).not.toBeInTheDocument();
  });

  it('rotates views in auto mode', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.fetchMonitorDashboard.mockResolvedValue(swissData);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<HallenMonitor tournament={tournament} />);

      await user.click(await screen.findByRole('button', { name: /Auto/ }));
      expect(screen.getByText('Laufende Begegnungen & Spielstände')).toBeInTheDocument();

      await vi.advanceTimersByTimeAsync(15000);
      expect(screen.getByText('Gesamttabelle Schweizer System')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the KO tree with highlighted winners during KO rounds', async () => {
    api.fetchMonitorDashboard.mockResolvedValue({
      ...swissData,
      round_type: 'ko',
      ko_stage: 'Halbfinale',
      ko_tree: [{
        stage: 'Halbfinale',
        round_number: 3,
        matches: [{ match_id: 1, slot: 1, team_a: 'Asse', team_b: 'Topspin', score_a: 3, score_b: 1,
          is_completed: true, winner_team_id: 1 }],
      }],
    });
    render(<HallenMonitor tournament={tournament} />);

    expect(await screen.findByText('KO-Runde: Halbfinale')).toBeInTheDocument();
    expect(screen.getByText('KO-Turnierbaum')).toBeInTheDocument();
    expect(screen.getByText('Topspin')).toHaveClass('text-slate-300');
    expect(screen.getByText('3 : 1')).toBeInTheDocument();
  });

  it('toggles fullscreen', async () => {
    api.fetchMonitorDashboard.mockResolvedValue(swissData);
    const request = vi.fn().mockResolvedValue();
    document.documentElement.requestFullscreen = request;
    const user = userEvent.setup();
    render(<HallenMonitor tournament={tournament} />);

    await user.click(await screen.findByTitle('Vollbild'));
    expect(request).toHaveBeenCalled();
  });
});
