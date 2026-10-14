const API_BASE = '/api';

// Admin PIN for this browser tab. Kept in sessionStorage so a reload doesn't
// lock the admin out, but closing the tab does.
const ADMIN_PIN_KEY = 'adminPin';
let adminPin = null;
try {
  adminPin = sessionStorage.getItem(ADMIN_PIN_KEY);
} catch {
  // Storage unavailable (private mode etc.): PIN lives in memory only.
}
const adminPinListeners = new Set();

export function getAdminPin() {
  return adminPin;
}

export function setAdminPin(pin) {
  adminPin = pin || null;
  try {
    if (adminPin) sessionStorage.setItem(ADMIN_PIN_KEY, adminPin);
    else sessionStorage.removeItem(ADMIN_PIN_KEY);
  } catch {
    // ignore, see above
  }
  adminPinListeners.forEach((cb) => cb(adminPin));
}

// Notifies cb(pin) whenever the PIN is set or cleared (e.g. rejected by the server).
export function subscribeAdminPin(cb) {
  adminPinListeners.add(cb);
  return () => adminPinListeners.delete(cb);
}

// fetch for admin endpoints: sends the PIN and forgets it if the server rejects it.
async function adminFetch(url, options, fallbackMessage) {
  const res = await fetch(url, {
    ...options,
    headers: { ...(options?.headers || {}), 'X-Admin-Pin': adminPin || '' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) setAdminPin(null);
    throw new Error(err.detail || fallbackMessage);
  }
  return res.json();
}

export async function verifyAdminPin(tournamentId, pin) {
  const res = await fetch(`${API_BASE}/tournaments/${tournamentId}/admin-check`, {
    headers: { 'X-Admin-Pin': pin },
  });
  if (res.status === 401 || res.status === 403) return false;
  if (!res.ok) throw new Error("Fehler bei der PIN-Prüfung");
  return true;
}

export async function fetchActiveTournament() {
  const res = await fetch(`${API_BASE}/tournaments/active`);
  if (!res.ok) throw new Error("Fehler beim Laden des Turniers");
  return res.json();
}

export async function updateTournament(tournamentId, data) {
  return adminFetch(`${API_BASE}/tournaments/${tournamentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }, "Fehler beim Aktualisieren");
}

export async function fetchTeams(tournamentId) {
  const res = await fetch(`${API_BASE}/tournaments/${tournamentId}/teams`);
  if (!res.ok) throw new Error("Fehler beim Laden der Teams");
  return res.json();
}

export async function createTeam(tournamentId, teamData) {
  return adminFetch(`${API_BASE}/tournaments/${tournamentId}/teams`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(teamData),
  }, "Fehler beim Anlegen des Teams");
}

export async function deleteTeam(tournamentId, teamId) {
  return adminFetch(`${API_BASE}/tournaments/${tournamentId}/teams/${teamId}`, {
    method: 'DELETE',
  }, "Fehler beim Löschen des Teams");
}

export async function uploadTeamsCsv(tournamentId, file) {
  const formData = new FormData();
  formData.append('file', file);
  return adminFetch(`${API_BASE}/tournaments/${tournamentId}/teams/csv`, {
    method: 'POST',
    body: formData,
  }, "Fehler beim CSV-Import");
}

export async function fetchRounds(tournamentId) {
  const res = await fetch(`${API_BASE}/tournaments/${tournamentId}/rounds`);
  if (!res.ok) throw new Error("Fehler beim Laden der Runden");
  return res.json();
}

export async function generateNextSwissRound(tournamentId) {
  return adminFetch(`${API_BASE}/tournaments/${tournamentId}/rounds/next-swiss`, {
    method: 'POST',
  }, "Fehler beim Erzeugen der nächsten Runde");
}

export async function startKoRound(tournamentId, teamCount = 4) {
  return adminFetch(`${API_BASE}/tournaments/${tournamentId}/rounds/start-ko?team_count=${teamCount}`, {
    method: 'POST',
  }, "Fehler beim Starten der KO-Runde");
}

export async function advanceKoRound(tournamentId) {
  return adminFetch(`${API_BASE}/tournaments/${tournamentId}/rounds/advance-ko`, {
    method: 'POST',
  }, "Fehler beim Weiterführen der KO-Runde");
}

export async function completeRound(roundId) {
  return adminFetch(`${API_BASE}/rounds/${roundId}/complete`, {
    method: 'POST',
  }, "Fehler beim Abschließen der Runde");
}

export async function swapPairings(roundId, matchId1, matchId2) {
  return adminFetch(`${API_BASE}/rounds/${roundId}/swap-pairings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ match_id_1: matchId1, match_id_2: matchId2 }),
  }, "Fehler beim Tauschen der Paarungen");
}

export async function fetchStandings(tournamentId) {
  const res = await fetch(`${API_BASE}/tournaments/${tournamentId}/standings`);
  if (!res.ok) throw new Error("Fehler beim Laden der Tabelle");
  return res.json();
}

export async function fetchMatch(matchId) {
  const res = await fetch(`${API_BASE}/matches/${matchId}`);
  if (!res.ok) throw new Error("Fehler beim Laden des Spiels");
  return res.json();
}

export async function setLineup(matchId, lineupData) {
  const res = await fetch(`${API_BASE}/matches/${matchId}/lineup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lineupData),
  });
  if (!res.ok) throw new Error("Fehler beim Bestätigen der Aufstellung");
  return res.json();
}

export async function updatePoint(matchId, gameId, pointData) {
  const res = await fetch(`${API_BASE}/matches/${matchId}/games/${gameId}/point`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pointData),
  });
  if (!res.ok) throw new Error("Fehler beim Aktualisieren des Punktestands");
  return res.json();
}

export async function submitQuickResult(matchId, gameId, sets) {
  const res = await fetch(`${API_BASE}/matches/${matchId}/games/${gameId}/quick-result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sets }),
  });
  if (!res.ok) throw new Error("Fehler beim Speichern des Schnellergebnisses");
  return res.json();
}

export async function fetchTablesStatus(tournamentId) {
  const res = await fetch(`${API_BASE}/tables/status/${tournamentId}`);
  if (!res.ok) throw new Error("Fehler beim Laden der Begegnungen");
  return res.json();
}

export async function authenticatePin(tournamentId, pin) {
  const res = await fetch(`${API_BASE}/tables/auth/${tournamentId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) throw new Error("PIN-Prüfung fehlgeschlagen");
  return res.json();
}

export async function fetchMonitorDashboard(tournamentId) {
  const res = await fetch(`${API_BASE}/monitors/${tournamentId}/dashboard`);
  if (!res.ok) throw new Error("Fehler beim Laden der Monitor-Daten");
  return res.json();
}
