import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminDashboard from './AdminDashboard';
import * as api from '../services/api';

vi.mock('../services/api', () => ({
  updateTournament: vi.fn(),
  fetchTeams: vi.fn(),
  createTeam: vi.fn(),
  deleteTeam: vi.fn(),
  uploadTeamsCsv: vi.fn(),
  fetchRounds: vi.fn(),
  generateNextSwissRound: vi.fn(),
  startKoRound: vi.fn(),
  completeRound: vi.fn(),
  swapPairings: vi.fn(),
  getAdminPin: vi.fn(),
  setAdminPin: vi.fn(),
}));

const tournament = {
  id: 1, name: 'Sommerturnier', swiss_rounds_count: 5, best_of_sets: 5,
  table_count: 8, tables_per_match: 1, ko_enabled: false,
};

const teams = (count) => Array.from({ length: count }, (_, i) => ({
  id: i + 1, name: `Team ${i + 1}`, player1_name: `S${i + 1}A`, player2_name: `S${i + 1}B`,
}));

const match = (id, a, b, extra = {}) => ({
  id, table_number: id, team_a: { name: a }, team_b: b ? { name: b } : null, team_b_id: b ? id + 100 : null, is_bye: !b,
  team_a_p1_name: `${a}1`, team_a_p2_name: `${a}2`, team_b_p1_name: null, team_b_p2_name: null,
  score_a: 0, score_b: 0, is_completed: false,
  individual_games: [{ is_completed: true }, { is_completed: false }],
  ...extra,
});

const activeRound = {
  id: 10, round_number: 2, round_type: 'swiss', is_active: true, is_completed: false,
  team_matches: [
    match(1, 'Asse', 'Blocker'),
    match(2, 'Topspin', 'Konter', { individual_games: [{ is_completed: false }, { is_completed: false }] }),
    match(3, 'Freilos-Team', null, { is_completed: true, score_a: 4 }),
  ],
};

const finishedRound = {
  id: 9, round_number: 1, round_type: 'swiss', is_active: false, is_completed: true,
  team_matches: [match(4, 'Asse', 'Konter', { score_a: 3, score_b: 1, is_completed: true })],
};

function setup({ teamList = teams(4), rounds = [], pin = '4711', props = {} } = {}) {
  api.fetchTeams.mockResolvedValue(teamList);
  api.fetchRounds.mockResolvedValue(rounds);
  api.getAdminPin.mockReturnValue(pin);
  const onTournamentChange = vi.fn();
  const user = userEvent.setup();
  render(<AdminDashboard tournament={tournament} onTournamentChange={onTournamentChange} {...props} />);
  return { user, onTournamentChange };
}

describe('AdminDashboard', () => {
  let confirm;
  let alert;

  beforeEach(() => {
    vi.resetAllMocks();
    confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    for (const fn of ['updateTournament', 'createTeam', 'deleteTeam', 'generateNextSwissRound',
      'startKoRound', 'completeRound', 'swapPairings']) {
      api[fn].mockResolvedValue({});
    }
  });

  describe('rounds', () => {
    it('draws the next Swiss round when none is active', async () => {
      const { user, onTournamentChange } = setup();

      expect(await screen.findByText('Keine aktive Runde')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Nächste Runde auslosen/ }));

      expect(api.generateNextSwissRound).toHaveBeenCalledWith(1);
      expect(onTournamentChange).toHaveBeenCalled();
    });

    it('needs at least two teams to draw a round', async () => {
      setup({ teamList: teams(1) });
      expect(await screen.findByRole('button', { name: /Nächste Runde auslosen/ })).toBeDisabled();
    });

    it('alerts when drawing fails', async () => {
      api.generateNextSwissRound.mockRejectedValue(new Error('Runde 1 ist noch aktiv'));
      const { user } = setup();

      await user.click(await screen.findByRole('button', { name: /Nächste Runde auslosen/ }));
      expect(alert).toHaveBeenCalledWith('Fehler: Runde 1 ist noch aktiv');
    });

    it('shows the active round with its pairings and completes it', async () => {
      const { user, onTournamentChange } = setup({ rounds: [finishedRound, activeRound] });

      expect(await screen.findByText('Runde 2 (Schweizer System) läuft')).toBeInTheDocument();
      expect(screen.getByText('FREILOS (BYE)')).toBeInTheDocument();
      expect(screen.getByText('Tisch 1')).toBeInTheDocument();
      expect(screen.getByText('Spiel läuft...')).toBeInTheDocument();
      expect(screen.getByText('Noch nicht begonnen')).toBeInTheDocument();
      expect(screen.getByText('✓ Match beendet')).toBeInTheDocument();
      expect(screen.getAllByText('1 / 2 Einzel gespielt')).toHaveLength(2);
      expect(screen.getByText('0 / 2 Einzel gespielt')).toBeInTheDocument();

      // History lists every round with its status
      expect(screen.getByText('Abgeschlossen')).toBeInTheDocument();
      expect(screen.getByText('Aktiv')).toBeInTheDocument();
      expect(screen.getByText('3 : 1')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /Runde 2 abschließen/ }));
      expect(confirm).toHaveBeenCalledWith('Runde wirklich abschließen?');
      expect(api.completeRound).toHaveBeenCalledWith(10);
      expect(onTournamentChange).toHaveBeenCalled();
    });

    it('does not complete the round when the admin cancels', async () => {
      confirm.mockReturnValue(false);
      const { user } = setup({ rounds: [activeRound] });

      await user.click(await screen.findByRole('button', { name: /Runde 2 abschließen/ }));
      expect(api.completeRound).not.toHaveBeenCalled();
    });

    it('reports a failing round completion', async () => {
      api.completeRound.mockRejectedValue(new Error('Es sind noch 2 Spiele nicht abgeschlossen.'));
      const { user } = setup({ rounds: [activeRound] });

      await user.click(await screen.findByRole('button', { name: /Runde 2 abschließen/ }));
      expect(alert).toHaveBeenCalledWith('Fehler: Es sind noch 2 Spiele nicht abgeschlossen.');
    });

    it('swaps two pairings', async () => {
      const { user } = setup({ rounds: [activeRound] });
      const [first, second] = await screen.findAllByRole('combobox');

      await user.click(screen.getByRole('button', { name: 'Tauschen' }));
      expect(alert).toHaveBeenCalledWith('Bitte zwei unterschiedliche Begegnungen auswählen.');

      await user.selectOptions(first, '1');
      await user.selectOptions(second, '1');
      await user.click(screen.getByRole('button', { name: 'Tauschen' }));
      expect(api.swapPairings).not.toHaveBeenCalled();

      await user.selectOptions(second, '2');
      await user.click(screen.getByRole('button', { name: 'Tauschen' }));
      expect(api.swapPairings).toHaveBeenCalledWith(10, 1, 2);
      expect(alert).toHaveBeenLastCalledWith('Paarungen getauscht!');
      expect(first).toHaveValue('');
    });

    it('reports a failing swap', async () => {
      api.swapPairings.mockRejectedValue(new Error('Begegnung bereits begonnen'));
      const { user } = setup({ rounds: [activeRound] });
      const [first, second] = await screen.findAllByRole('combobox');

      await user.selectOptions(first, '1');
      await user.selectOptions(second, '2');
      await user.click(screen.getByRole('button', { name: 'Tauschen' }));
      expect(alert).toHaveBeenCalledWith('Fehler beim Tauschen: Begegnung bereits begonnen');
    });

    it('starts the KO phase after the Swiss rounds', async () => {
      const { user, onTournamentChange } = setup({ teamList: teams(8), rounds: [finishedRound] });

      await user.click(await screen.findByRole('button', { name: /Top 8 KO starten/ }));
      expect(confirm).toHaveBeenCalledWith('KO-Runde mit den besten 8 Teams starten?');
      expect(api.startKoRound).toHaveBeenCalledWith(1, 8);
      expect(onTournamentChange).toHaveBeenCalled();

      api.startKoRound.mockRejectedValue(new Error('Nicht genügend Teams'));
      await user.click(screen.getByRole('button', { name: /Top 4 KO starten/ }));
      expect(api.startKoRound).toHaveBeenLastCalledWith(1, 4);
      expect(alert).toHaveBeenCalledWith('Fehler: Nicht genügend Teams');

      confirm.mockReturnValue(false);
      await user.click(screen.getByRole('button', { name: /Top 4 KO starten/ }));
      expect(api.startKoRound).toHaveBeenCalledTimes(2);
    });

    it('offers only Top 4 with fewer than 8 teams', async () => {
      setup({ rounds: [finishedRound] });
      expect(await screen.findByRole('button', { name: /Top 4 KO starten/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Top 8 KO starten/ })).not.toBeInTheDocument();
    });

    it('hides the KO start when KO is already enabled', async () => {
      setup({ rounds: [finishedRound], props: { tournament: { ...tournament, ko_enabled: true } } });
      await screen.findByText('Keine aktive Runde');
      expect(screen.queryByRole('button', { name: /KO starten/ })).not.toBeInTheDocument();
    });

    it('names the KO stage of an active KO round', async () => {
      setup({ rounds: [{ ...activeRound, round_type: 'ko', ko_stage: 'Halbfinale' }] });
      expect(await screen.findByText('Runde 2 (Halbfinale) läuft')).toBeInTheDocument();
    });
  });

  describe('teams', () => {
    it('lists, adds and removes teams', async () => {
      const { user } = setup();
      await user.click(await screen.findByRole('button', { name: 'Teams (4)' }));

      expect(screen.getByText('Team 3')).toBeInTheDocument();

      await user.type(screen.getByPlaceholderText('z. B. Die Schmetterbälle'), 'Neu');
      const [p1, p2] = screen.getAllByPlaceholderText('Vor- und Nachname');
      await user.type(p1, 'Anna');
      await user.type(p2, 'Ben');
      await user.click(screen.getByRole('button', { name: 'Team hinzufügen' }));

      expect(api.createTeam).toHaveBeenCalledWith(1, { name: 'Neu', player1_name: 'Anna', player2_name: 'Ben' });
      expect(screen.getByPlaceholderText('z. B. Die Schmetterbälle')).toHaveValue('');

      const row = screen.getByText('Team 2').closest('tr');
      await user.click(within(row).getByRole('button'));
      expect(api.deleteTeam).toHaveBeenCalledWith(1, 2);

      confirm.mockReturnValue(false);
      await user.click(within(row).getByRole('button'));
      expect(api.deleteTeam).toHaveBeenCalledTimes(1);
    });

    it('reports errors when adding or deleting teams fails', async () => {
      api.createTeam.mockRejectedValue(new Error('Doppelt'));
      api.deleteTeam.mockRejectedValue(new Error('Nicht gefunden'));
      const { user } = setup();
      await user.click(await screen.findByRole('button', { name: 'Teams (4)' }));

      await user.type(screen.getByPlaceholderText('z. B. Die Schmetterbälle'), 'Neu');
      const [p1, p2] = screen.getAllByPlaceholderText('Vor- und Nachname');
      await user.type(p1, 'Anna');
      await user.type(p2, 'Ben');
      await user.click(screen.getByRole('button', { name: 'Team hinzufügen' }));
      expect(alert).toHaveBeenCalledWith('Fehler: Doppelt');

      await user.click(within(screen.getByText('Team 1').closest('tr')).getByRole('button'));
      expect(alert).toHaveBeenCalledWith('Fehler: Nicht gefunden');
    });

    it('imports teams from a CSV file', async () => {
      api.uploadTeamsCsv.mockResolvedValue({ message: '2 Teams erfolgreich importiert' });
      const { user } = setup();
      await user.click(await screen.findByRole('button', { name: 'Teams (4)' }));

      const input = document.querySelector('input[type="file"]');
      const file = new File(['A;B;C'], 'teams.csv', { type: 'text/csv' });
      await user.upload(input, file);

      expect(api.uploadTeamsCsv).toHaveBeenCalledWith(1, file);
      expect(alert).toHaveBeenCalledWith('2 Teams erfolgreich importiert');

      api.uploadTeamsCsv.mockRejectedValue(new Error('Kaputt'));
      await user.upload(input, file);
      expect(alert).toHaveBeenCalledWith('Fehler beim Upload: Kaputt');
    });

    it('loads demo teams into an empty tournament', async () => {
      const { user } = setup({ teamList: [] });
      await user.click(await screen.findByRole('button', { name: 'Teams (0)' }));
      expect(screen.getByText('Noch keine Mannschaften angelegt.')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /8 Demo-Teams automatisch laden/ }));
      expect(api.createTeam).toHaveBeenCalledTimes(8);
      expect(alert).toHaveBeenCalledWith('8 Demo-Teams wurden erfolgreich hinzugefügt!');

      api.createTeam.mockRejectedValue(new Error('Server weg'));
      await user.click(screen.getByRole('button', { name: /8 Demo-Teams automatisch laden/ }));
      expect(alert).toHaveBeenCalledWith('Fehler: Server weg');
    });
  });

  describe('PINs and settings', () => {
    it('warns while the default admin PIN is in use', async () => {
      setup({ pin: 'admin123' });
      expect(await screen.findByText(/Standardwert/)).toBeInTheDocument();
    });

    it('saves the settings and switches to the new PIN', async () => {
      const { user, onTournamentChange } = setup();
      await user.click(await screen.findByRole('button', { name: 'Einstellungen' }));

      const name = screen.getByDisplayValue('Sommerturnier');
      await user.clear(name);
      await user.type(name, 'Herbstturnier');
      await user.clear(screen.getByDisplayValue('5'));
      await user.type(screen.getByRole('spinbutton'), '7');
      await user.selectOptions(screen.getByRole('combobox'), '3');
      const pin = screen.getByDisplayValue('4711');
      await user.clear(pin);
      await user.type(pin, ' 0815 ');
      await user.click(screen.getByRole('button', { name: /Änderungen speichern/ }));

      expect(api.updateTournament).toHaveBeenCalledWith(1, expect.objectContaining({
        name: 'Herbstturnier', swiss_rounds_count: 7, best_of_sets: 3, admin_pin: ' 0815 ',
      }));
      expect(api.setAdminPin).toHaveBeenCalledWith('0815');
      expect(onTournamentChange).toHaveBeenCalled();
      expect(alert).toHaveBeenCalledWith('Einstellungen gespeichert!');
    });

    it('keeps the old PIN when saving fails', async () => {
      api.updateTournament.mockRejectedValue(new Error('Die Admin-PIN darf nicht leer sein.'));
      const { user } = setup();
      await user.click(await screen.findByRole('button', { name: 'Einstellungen' }));

      await user.click(screen.getByRole('button', { name: /Änderungen speichern/ }));
      expect(alert).toHaveBeenCalledWith('Fehler: Die Admin-PIN darf nicht leer sein.');
      expect(api.setAdminPin).not.toHaveBeenCalled();
    });

    it('locks the admin area', async () => {
      const { user } = setup();
      await user.click(await screen.findByRole('button', { name: /Sperren/ }));
      expect(api.setAdminPin).toHaveBeenCalledWith(null);
    });
  });

  it('survives failing loads', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.fetchTeams.mockRejectedValue(new Error('offline'));
    api.fetchRounds.mockResolvedValue([]);
    api.getAdminPin.mockReturnValue(null);
    render(<AdminDashboard tournament={tournament} />);

    expect(await screen.findByText('Keine aktive Runde')).toBeInTheDocument();
  });
});
