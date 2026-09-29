const API_BASE = '/api';

export async function fetchActiveTournament() {
  const res = await fetch(`${API_BASE}/tournaments/active`);
  if (!res.ok) throw new Error("Fehler beim Laden des Turniers");
  return res.json();
}

export async function updateTournament(tournamentId, data) {
  const res = await fetch(`${API_BASE}/tournaments/${tournamentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Fehler beim Aktualisieren");
  return res.json();
}

export async function fetchTeams(tournamentId) {
  const res = await fetch(`${API_BASE}/tournaments/${tournamentId}/teams`);
  if (!res.ok) throw new Error("Fehler beim Laden der Teams");
  return res.json();
}

export async function createTeam(tournamentId, teamData) {
  const res = await fetch(`${API_BASE}/tournaments/${tournamentId}/teams`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(teamData),
  });
  if (!res.ok) throw new Error("Fehler beim Anlegen des Teams");
  return res.json();
}

export async function deleteTeam(tournamentId, teamId) {
  const res = await fetch(`${API_BASE}/tournaments/${tournamentId}/teams/${teamId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error("Fehler beim Löschen des Teams");
  return res.json();
}

export async function uploadTeamsCsv(tournamentId, file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/tournaments/${tournamentId}/teams/csv`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error("Fehler beim CSV-Import");
  return res.json();
}

export async function fetchRounds(tournamentId) {
  const res = await fetch(`${API_BASE}/tournaments/${tournamentId}/rounds`);
  if (!res.ok) throw new Error("Fehler beim Laden der Runden");
  return res.json();
}

export async function generateNextSwissRound(tournamentId) {
  const res = await fetch(`${API_BASE}/tournaments/${tournamentId}/rounds/next-swiss`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Fehler beim Erzeugen der nächsten Runde");
  }
  return res.json();
}

export async function startKoRound(tournamentId, teamCount = 4) {
  const res = await fetch(`${API_BASE}/tournaments/${tournamentId}/rounds/start-ko?team_count=${teamCount}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Fehler beim Starten der KO-Runde");
  }
  return res.json();
}

export async function advanceKoRound(tournamentId) {
  const res = await fetch(`${API_BASE}/tournaments/${tournamentId}/rounds/advance-ko`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Fehler beim Weiterführen der KO-Runde");
  }
  return res.json();
}

export async function completeRound(roundId) {
  const res = await fetch(`${API_BASE}/rounds/${roundId}/complete`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Fehler beim Abschließen der Runde");
  }
  return res.json();
}

export async function swapPairings(roundId, matchId1, matchId2) {
  const res = await fetch(`${API_BASE}/rounds/${roundId}/swap-pairings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ match_id_1: matchId1, match_id_2: matchId2 }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Fehler beim Tauschen der Paarungen");
  }
  return res.json();
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
  if (!res.ok) throw new Error("Fehler beim Laden der Tische");
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
