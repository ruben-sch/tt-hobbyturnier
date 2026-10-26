import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from './api';
import { createTeam, getAdminPin, setAdminPin, subscribeAdminPin, verifyAdminPin } from './api';

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
});

describe('admin PIN handling', () => {
  beforeEach(() => {
    setAdminPin(null);
    globalThis.fetch = vi.fn();
  });

  it('sends the stored PIN on admin calls', async () => {
    setAdminPin('4711');
    fetch.mockResolvedValue(jsonResponse(200, { id: 1 }));

    await createTeam(1, { name: 'T' });

    const [, options] = fetch.mock.calls[0];
    expect(options.headers['X-Admin-Pin']).toBe('4711');
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('forgets a rejected PIN and notifies listeners', async () => {
    setAdminPin('alt');
    const listener = vi.fn();
    const unsubscribe = subscribeAdminPin(listener);
    fetch.mockResolvedValue(jsonResponse(403, { detail: 'Falsche Admin-PIN.' }));

    await expect(createTeam(1, { name: 'T' })).rejects.toThrow('Falsche Admin-PIN.');

    expect(getAdminPin()).toBeNull();
    expect(sessionStorage.getItem('adminPin')).toBeNull();
    expect(listener).toHaveBeenCalledWith(null);
    unsubscribe();
  });

  it('keeps the PIN on other errors', async () => {
    setAdminPin('4711');
    fetch.mockResolvedValue(jsonResponse(400, { detail: 'Runde 1 ist noch aktiv.' }));

    await expect(createTeam(1, { name: 'T' })).rejects.toThrow('Runde 1 ist noch aktiv.');
    expect(getAdminPin()).toBe('4711');
  });

  it('verifyAdminPin reports wrong PINs as false', async () => {
    fetch.mockResolvedValueOnce(jsonResponse(200, {}));
    expect(await verifyAdminPin(1, 'richtig')).toBe(true);
    fetch.mockResolvedValueOnce(jsonResponse(403, {}));
    expect(await verifyAdminPin(1, 'falsch')).toBe(false);
  });
});

describe('endpoints', () => {
  beforeEach(() => {
    setAdminPin('4711');
    globalThis.fetch = vi.fn();
  });

  // [call, expected URL, expected method, error message on failure]
  const cases = [
    [() => api.fetchActiveTournament(), '/api/tournaments/active', undefined, 'Fehler beim Laden des Turniers'],
    [() => api.updateTournament(1, { name: 'X' }), '/api/tournaments/1', 'PUT', 'Fehler beim Aktualisieren'],
    [() => api.fetchTeams(1), '/api/tournaments/1/teams', undefined, 'Fehler beim Laden der Teams'],
    [() => api.deleteTeam(1, 9), '/api/tournaments/1/teams/9', 'DELETE', 'Fehler beim Löschen des Teams'],
    [() => api.uploadTeamsCsv(1, new Blob(['a;b;c'])), '/api/tournaments/1/teams/csv', 'POST', 'Fehler beim CSV-Import'],
    [() => api.fetchRounds(1), '/api/tournaments/1/rounds', undefined, 'Fehler beim Laden der Runden'],
    [() => api.generateNextSwissRound(1), '/api/tournaments/1/rounds/next-swiss', 'POST', 'Fehler beim Erzeugen der nächsten Runde'],
    [() => api.startKoRound(1, 8), '/api/tournaments/1/rounds/start-ko?team_count=8', 'POST', 'Fehler beim Starten der KO-Runde'],
    [() => api.advanceKoRound(1), '/api/tournaments/1/rounds/advance-ko', 'POST', 'Fehler beim Weiterführen der KO-Runde'],
    [() => api.completeRound(5), '/api/rounds/5/complete', 'POST', 'Fehler beim Abschließen der Runde'],
    [() => api.swapPairings(5, 1, 2), '/api/rounds/5/swap-pairings', 'POST', 'Fehler beim Tauschen der Paarungen'],
    [() => api.fetchStandings(1), '/api/tournaments/1/standings', undefined, 'Fehler beim Laden der Tabelle'],
    [() => api.fetchMatch(7), '/api/matches/7', undefined, 'Fehler beim Laden des Spiels'],
    [() => api.setLineup(7, {}), '/api/matches/7/lineup', 'POST', 'Fehler beim Bestätigen der Aufstellung'],
    [() => api.submitGameResult(7, 3, 3, 1), '/api/matches/7/games/3/result', 'POST', 'Fehler beim Speichern des Ergebnisses'],
    [() => api.fetchTablesStatus(1), '/api/tables/status/1', undefined, 'Fehler beim Laden der Begegnungen'],
    [() => api.authenticatePin(1, '1001'), '/api/tables/auth/1', 'POST', 'PIN-Prüfung fehlgeschlagen'],
    [() => api.fetchMonitorDashboard(1), '/api/monitors/1/dashboard', undefined, 'Fehler beim Laden der Monitor-Daten'],
    [() => api.fetchServerInfo(), '/api/server/info', undefined, 'Fehler beim Laden der Server-Adresse'],
  ];

  it.each(cases)('calls endpoint %#', async (call, url, method) => {
    fetch.mockResolvedValue(jsonResponse(200, { ok: true }));
    await expect(call()).resolves.toEqual({ ok: true });

    const [calledUrl, options] = fetch.mock.calls[0];
    expect(calledUrl).toBe(url);
    expect(options?.method).toBe(method);
  });

  it.each(cases)('endpoint %# reports failures as German errors', async (call, _url, _method, message) => {
    // Error responses without a JSON body fall back to the generic message
    fetch.mockResolvedValue({ ok: false, status: 500, json: () => Promise.reject(new Error('no json')) });
    await expect(call()).rejects.toThrow(message);
  });

  it('sends request bodies as JSON', async () => {
    fetch.mockResolvedValue(jsonResponse(200, {}));
    await api.swapPairings(5, 1, 2);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ match_id_1: 1, match_id_2: 2 });

    await api.submitGameResult(7, 3, 3, 1);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ sets_a: 3, sets_b: 1 });
  });

  it('verifyAdminPin throws on server errors', async () => {
    fetch.mockResolvedValue(jsonResponse(500, {}));
    await expect(api.verifyAdminPin(1, 'x')).rejects.toThrow('Fehler bei der PIN-Prüfung');
  });
});
