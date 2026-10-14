import React, { useState, useEffect, useCallback } from 'react';
import { 
  updateTournament, 
  fetchTeams, 
  createTeam, 
  deleteTeam, 
  uploadTeamsCsv, 
  fetchRounds, 
  generateNextSwissRound, 
  startKoRound, 
  completeRound,
  swapPairings,
  fetchTablesStatus,
  getAdminPin,
  setAdminPin
} from '../services/api';
import { useLiveEvent, MATCH_EVENTS, TEAM_EVENTS } from '../hooks/useLiveEvents';
import { 
  Settings, 
  Plus, 
  Trash2, 
  Upload, 
  Play, 
  GitFork, 
  CheckCircle, 
  ArrowLeftRight, 
  Sparkles,
  Save,
  Lock
} from 'lucide-react';

export default function AdminDashboard({ tournament, onTournamentChange }) {
  const [activeTab, setActiveTab] = useState('rounds'); // 'rounds', 'teams', 'settings', 'tables'
  const [teams, setTeams] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(false);

  // New Team form
  const [newTeam, setNewTeam] = useState({ name: '', player1_name: '', player2_name: '' });

  // Settings form
  const [settingsForm, setSettingsForm] = useState({
    name: '',
    swiss_rounds_count: 5,
    best_of_sets: 5,
    table_count: 8,
    tables_per_match: 1,
    admin_pin: getAdminPin() || ''
  });

  // Swap pairings state
  const [swapMatch1, setSwapMatch1] = useState('');
  const [swapMatch2, setSwapMatch2] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const [tList, rList, tblList] = await Promise.all([
        fetchTeams(tournament.id),
        fetchRounds(tournament.id),
        fetchTablesStatus(tournament.id)
      ]);
      setTeams(tList);
      setRounds(rList);
      setTables(tblList);
    } catch (e) {
      console.error(e);
    }
  }, [tournament]);

  useEffect(() => {
    if (tournament?.id) {
      setSettingsForm({
        name: tournament.name,
        swiss_rounds_count: tournament.swiss_rounds_count,
        best_of_sets: tournament.best_of_sets,
        table_count: tournament.table_count,
        tables_per_match: tournament.tables_per_match,
        admin_pin: getAdminPin() || ''
      });
      loadAll();
    }
  }, [tournament, loadAll]);

  useLiveEvent([...MATCH_EVENTS, ...TEAM_EVENTS], loadAll);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await updateTournament(tournament.id, settingsForm);
      // Later admin calls must send the new PIN
      setAdminPin(settingsForm.admin_pin.trim());
      onTournamentChange && onTournamentChange();
      alert("Einstellungen gespeichert!");
    } catch (e) {
      alert("Fehler: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTeam = async (e) => {
    e.preventDefault();
    if (!newTeam.name || !newTeam.player1_name || !newTeam.player2_name) {
      alert("Bitte alle Felder ausfüllen.");
      return;
    }
    try {
      await createTeam(tournament.id, newTeam);
      setNewTeam({ name: '', player1_name: '', player2_name: '' });
      loadAll();
    } catch (e) {
      alert("Fehler: " + e.message);
    }
  };

  const handleDeleteTeam = async (teamId) => {
    if (!confirm("Team wirklich entfernen?")) return;
    try {
      await deleteTeam(tournament.id, teamId);
      loadAll();
    } catch (e) {
      alert("Fehler: " + e.message);
    }
  };

  const handleCsvUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      setLoading(true);
      const res = await uploadTeamsCsv(tournament.id, file);
      alert(res.message);
      loadAll();
    } catch (e) {
      alert("Fehler beim Upload: " + e.message);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleLoadSampleTeams = async () => {
    const sampleTeams = [
      { name: "Topspin Titans", player1_name: "Lukas Weber", player2_name: "Maximilian Koch" },
      { name: "Netzroller 05", player1_name: "Stefan Bauer", player2_name: "Florian Richter" },
      { name: "Noppen-Könige", player1_name: "Tim Schneider", player2_name: "Jan Hoffmann" },
      { name: "Kantenball e.V.", player1_name: "Markus Wolf", player2_name: "Felix Wagner" },
      { name: "Tischtennis Freunde", player1_name: "Christian Becker", player2_name: "David Schulz" },
      { name: "Spin Doctors", player1_name: "Alexander Meyer", player2_name: "Tobias Schmidt" },
      { name: "Schmetterbälle", player1_name: "Marcel Braun", player2_name: "Simon Fischer" },
      { name: "Angriffslustig", player1_name: "Jonas Zimmermann", player2_name: "Patrick Klein" }
    ];

    try {
      setLoading(true);
      for (const t of sampleTeams) {
        await createTeam(tournament.id, t);
      }
      loadAll();
      alert("8 Demo-Teams wurden erfolgreich hinzugefügt!");
    } catch (e) {
      alert("Fehler: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateNextRound = async () => {
    try {
      setLoading(true);
      await generateNextSwissRound(tournament.id);
      await loadAll();
      onTournamentChange && onTournamentChange();
    } catch (e) {
      alert("Fehler: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartKO = async (teamCount) => {
    if (!confirm(`KO-Runde mit den besten ${teamCount} Teams starten?`)) return;
    try {
      setLoading(true);
      await startKoRound(tournament.id, teamCount);
      await loadAll();
      onTournamentChange && onTournamentChange();
    } catch (e) {
      alert("Fehler: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteRound = async (roundId) => {
    if (!confirm("Runde wirklich abschließen?")) return;
    try {
      setLoading(true);
      await completeRound(roundId);
      await loadAll();
      onTournamentChange && onTournamentChange();
    } catch (e) {
      alert("Fehler: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSwap = async (roundId) => {
    if (!swapMatch1 || !swapMatch2 || swapMatch1 === swapMatch2) {
      alert("Bitte zwei unterschiedliche Begegnungen auswählen.");
      return;
    }
    try {
      setLoading(true);
      await swapPairings(roundId, parseInt(swapMatch1), parseInt(swapMatch2));
      alert("Paarungen getauscht!");
      setSwapMatch1('');
      setSwapMatch2('');
      loadAll();
    } catch (e) {
      alert("Fehler beim Tauschen: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const activeRound = rounds.find(r => r.is_active);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2">
            <Settings className="w-7 h-7 text-sky-400" />
            <span>Turnierleitung / Administration</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Steuerung der Runden, Paarungsanpassung, Teamverwaltung und Einstellungen.
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs">
            <button
              onClick={() => setActiveTab('rounds')}
              className={`px-3.5 py-2 rounded-lg font-semibold transition ${
                activeTab === 'rounds' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Runden & Spiele
            </button>
            <button
              onClick={() => setActiveTab('teams')}
              className={`px-3.5 py-2 rounded-lg font-semibold transition ${
                activeTab === 'teams' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Teams ({teams.length})
            </button>
            <button
              onClick={() => setActiveTab('tables')}
              className={`px-3.5 py-2 rounded-lg font-semibold transition ${
                activeTab === 'tables' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              PIN-Übersicht
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3.5 py-2 rounded-lg font-semibold transition ${
                activeTab === 'settings' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Einstellungen
            </button>
          </div>
          <button
            onClick={() => setAdminPin(null)}
            title="Turnierleitung sperren"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Sperren</span>
          </button>
        </div>
      </div>

      {getAdminPin() === 'admin123' && (
        <div className="mb-6 p-4 bg-amber-950/40 border border-amber-500/40 rounded-xl text-sm text-amber-200">
          Die Admin-PIN ist noch der Standardwert <span className="font-mono">admin123</span>. Bitte unter
          „Einstellungen“ ändern – sonst kann jeder im Netzwerk die Turnierleitung öffnen.
        </div>
      )}

      {/* ROUNDS TAB */}
      {activeTab === 'rounds' && (
        <div className="space-y-8">
          
          {/* Action Bar */}
          <div className="bg-slate-800/90 border border-slate-700 p-6 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-xl">
            <div>
              <h3 className="font-bold text-white text-lg">
                {activeRound ? `Runde ${activeRound.round_number} (${activeRound.round_type === 'ko' ? activeRound.ko_stage : 'Schweizer System'}) läuft` : 'Keine aktive Runde'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {activeRound ? 'Ergebnisse werden erfasst.' : 'Lose die nächste Runde aus, um Spiele zu generieren.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {!activeRound && (
                <button
                  onClick={handleGenerateNextRound}
                  disabled={loading || teams.length < 2}
                  className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-sky-500/20 transition"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Nächste Runde auslosen (Schweizer System)</span>
                </button>
              )}

              {activeRound && (
                <button
                  onClick={() => handleCompleteRound(activeRound.id)}
                  disabled={loading}
                  className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-emerald-500/20 transition"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Runde {activeRound.round_number} abschließen</span>
                </button>
              )}

              {/* Transition to KO buttons */}
              {!activeRound && rounds.length > 0 && !tournament.ko_enabled && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleStartKO(4)}
                    disabled={loading || teams.length < 4}
                    className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow transition"
                  >
                    <GitFork className="w-3.5 h-3.5" />
                    <span>Top 4 KO starten</span>
                  </button>
                  {teams.length >= 8 && (
                    <button
                      onClick={() => handleStartKO(8)}
                      disabled={loading}
                      className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow transition"
                    >
                      <GitFork className="w-3.5 h-3.5" />
                      <span>Top 8 KO starten</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ACTIVE ROUND PAIRINGS & MANUAL SWAP */}
          {activeRound && (
            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-700/60">
                <div>
                  <h4 className="font-bold text-white text-base">
                    Paarungen von Runde {activeRound.round_number}
                  </h4>
                  <p className="text-xs text-slate-400">
                    Falls vor Spielbeginn Paarungen manuell getauscht werden müssen:
                  </p>
                </div>

                {/* Swap tool */}
                <div className="flex items-center gap-2 bg-slate-900 p-2 rounded-xl border border-slate-700 text-xs">
                  <ArrowLeftRight className="w-4 h-4 text-sky-400" />
                  <select
                    value={swapMatch1}
                    onChange={(e) => setSwapMatch1(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-white"
                  >
                    <option value="">Spiel 1 wählen...</option>
                    {activeRound.team_matches.map((m, idx) => (
                      <option key={m.id} value={m.id}>
                        Paarung {idx + 1}: {m.team_a?.name} vs {m.team_b?.name || 'BYE'}
                      </option>
                    ))}
                  </select>
                  <span>↔</span>
                  <select
                    value={swapMatch2}
                    onChange={(e) => setSwapMatch2(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-white"
                  >
                    <option value="">Spiel 2 wählen...</option>
                    {activeRound.team_matches.map((m, idx) => (
                      <option key={m.id} value={m.id}>
                        Paarung {idx + 1}: {m.team_a?.name} vs {m.team_b?.name || 'BYE'}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleSwap(activeRound.id)}
                    className="bg-sky-500 hover:bg-sky-400 text-white px-3 py-1 rounded-lg font-semibold transition"
                  >
                    Tauschen
                  </button>
                </div>
              </div>

              {/* Match List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeRound.team_matches.map((m, idx) => (
                  <div key={m.id} className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-4">
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                      <span className="font-bold text-sky-400">
                        {m.team_b_id ? `Paarung ${idx + 1}` : 'FREILOS (BYE)'}
                      </span>
                      <span className="font-mono bg-slate-800 px-2 py-0.5 rounded text-slate-300">
                        PIN: {m.match_pin}
                      </span>
                    </div>

                    <div className="flex items-center justify-between my-2">
                      <div>
                        <div className="font-bold text-white text-sm">{m.team_a?.name}</div>
                        <div className="text-[11px] text-slate-400">{m.team_a_p1_name} & {m.team_a_p2_name}</div>
                      </div>

                      <div className="font-mono text-xl font-bold text-emerald-400 px-3">
                        {m.score_a} : {m.score_b}
                      </div>

                      <div className="text-right">
                        <div className="font-bold text-white text-sm">{m.team_b?.name || 'FREILOS'}</div>
                        <div className="text-[11px] text-slate-400">{m.team_b_p1_name} & {m.team_b_p2_name}</div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <span className={m.is_completed ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                        {m.is_completed ? '✓ Match beendet' : (m.lineup_confirmed ? 'Spiel läuft...' : 'Aufstellung offen')}
                      </span>
                      <span className="text-slate-500 font-mono">
                        {m.individual_games.filter(g => g.is_completed).length} / {m.individual_games.length} Einzel gespielt
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* HISTORICAL ROUNDS */}
          <div className="space-y-4">
            <h4 className="font-bold text-white text-base">Alle bisherigen Runden</h4>
            {rounds.map((r) => (
              <details key={r.id} className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
                <summary className="cursor-pointer font-semibold text-slate-200 flex items-center justify-between text-sm">
                  <span>Runde {r.round_number} ({r.round_type === 'ko' ? r.ko_stage : 'Schweizer System'})</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${r.is_completed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-sky-500/20 text-sky-400'}`}>
                    {r.is_completed ? 'Abgeschlossen' : 'Aktiv'}
                  </span>
                </summary>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                  {r.team_matches.map(m => (
                    <div key={m.id} className="bg-slate-900/60 p-3 rounded-lg border border-slate-800 text-xs flex items-center justify-between">
                      <span className="font-semibold text-white truncate max-w-[120px]">{m.team_a?.name}</span>
                      <span className="font-mono font-bold text-emerald-400 px-2">{m.score_a} : {m.score_b}</span>
                      <span className="font-semibold text-white truncate max-w-[120px]">{m.team_b?.name || 'BYE'}</span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>

        </div>
      )}

      {/* TEAMS TAB */}
      {activeTab === 'teams' && (
        <div className="space-y-8">
          
          {/* Add Team & CSV Import Card */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Manual Form */}
            <div className="lg:col-span-2 bg-slate-800/80 border border-slate-700 rounded-2xl p-6 shadow-xl">
              <h3 className="font-bold text-white text-base mb-4 flex items-center gap-2">
                <Plus className="w-5 h-5 text-sky-400" />
                <span>Neues 2er-Team anlegen</span>
              </h3>

              <form onSubmit={handleAddTeam} className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 font-medium">Mannschaftsname</label>
                  <input
                    type="text"
                    required
                    placeholder="z. B. Die Schmetterbälle"
                    value={newTeam.name}
                    onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
                    className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 font-medium">Spieler 1 Name</label>
                    <input
                      type="text"
                      required
                      placeholder="Vor- und Nachname"
                      value={newTeam.player1_name}
                      onChange={(e) => setNewTeam({ ...newTeam, player1_name: e.target.value })}
                      className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 font-medium">Spieler 2 Name</label>
                    <input
                      type="text"
                      required
                      placeholder="Vor- und Nachname"
                      value={newTeam.player2_name}
                      onChange={(e) => setNewTeam({ ...newTeam, player2_name: e.target.value })}
                      className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="submit"
                    className="bg-sky-500 hover:bg-sky-400 text-white font-semibold px-5 py-2 rounded-xl text-sm transition shadow-lg shadow-sky-500/20"
                  >
                    Team hinzufügen
                  </button>
                </div>
              </form>
            </div>

            {/* CSV Import & Demo Helper */}
            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-white text-base mb-2 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-emerald-400" />
                  <span>CSV-Import</span>
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  Importiere mehrere Teams gleichzeitig via CSV (Format: <code>Teamname;Spieler1;Spieler2</code>).
                </p>

                <label className="border-2 border-dashed border-slate-600 hover:border-sky-500 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition text-center">
                  <Upload className="w-6 h-6 text-slate-400 mb-1" />
                  <span className="text-xs font-semibold text-slate-300">CSV-Datei auswählen</span>
                  <input type="file" accept=".csv,.txt" onChange={handleCsvUpload} className="hidden" />
                </label>
              </div>

              {teams.length === 0 && (
                <div className="mt-4 pt-4 border-t border-slate-700">
                  <button
                    onClick={handleLoadSampleTeams}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-sky-600 hover:from-emerald-500 hover:to-sky-500 text-white py-2.5 rounded-xl text-xs font-bold transition shadow"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>8 Demo-Teams automatisch laden</span>
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* Teams Table */}
          <div className="bg-slate-800/80 border border-slate-700 rounded-2xl overflow-hidden shadow-xl">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-slate-400 font-semibold uppercase text-xs">
                <tr>
                  <th className="p-3.5">#</th>
                  <th className="p-3.5">Mannschaftsname</th>
                  <th className="p-3.5">Spieler 1</th>
                  <th className="p-3.5">Spieler 2</th>
                  <th className="p-3.5 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {teams.map((t, idx) => (
                  <tr key={t.id} className="hover:bg-slate-700/30">
                    <td className="p-3.5 text-slate-400 text-xs font-mono">{idx + 1}</td>
                    <td className="p-3.5 font-bold text-white">{t.name}</td>
                    <td className="p-3.5 text-slate-300">{t.player1_name}</td>
                    <td className="p-3.5 text-slate-300">{t.player2_name}</td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => handleDeleteTeam(t.id)}
                        className="text-rose-400 hover:text-rose-300 p-1.5 rounded-lg hover:bg-rose-500/10 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {teams.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">
                      Noch keine Mannschaften angelegt.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* MATCH PINS OVERVIEW */}
      {activeTab === 'tables' && (
        <div className="space-y-6">
          <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6">
            <h3 className="font-bold text-white text-base mb-1">
              Übersicht aller Match-PINs & Admin-PIN
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              Teile diese PINs den jeweiligen Spielern zur Ergebniseingabe mit.
            </p>

            <div className="mb-6 p-4 bg-sky-950/40 border border-sky-500/30 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs text-sky-400 font-bold block uppercase">Admin-PIN (Turnierleitung)</span>
                <span className="text-xs text-slate-300">Voller Zugriff auf alle Einstellungen & manuelle Spielübernahme</span>
              </div>
              <span className="font-mono text-xl font-black text-white bg-slate-900 px-4 py-1.5 rounded-lg border border-slate-700">
                {getAdminPin()}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {tables.map((tbl, idx) => (
                <div key={tbl.table_number || idx} className="bg-slate-900 p-4 rounded-xl border border-slate-700/80 text-center">
                  <span className="text-xs font-bold text-slate-400 block mb-1">
                    BEGEGNUNG #{idx + 1}
                  </span>
                  <span className="font-mono text-2xl font-black text-emerald-400 tracking-wider">
                    {tbl.pin_code}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS TAB */}
      {activeTab === 'settings' && (
        <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 sm:p-8 max-w-2xl shadow-xl">
          <h3 className="font-bold text-white text-xl mb-4">
            Turnier-Konfiguration
          </h3>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 font-medium">Turniername</label>
              <input
                type="text"
                value={settingsForm.name}
                onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 font-medium">Runden im Schweizer System (variabel)</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={settingsForm.swiss_rounds_count}
                  onChange={(e) => setSettingsForm({ ...settingsForm, swiss_rounds_count: parseInt(e.target.value) })}
                  className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-medium">Satzmodus pro Einzel</label>
                <select
                  value={settingsForm.best_of_sets}
                  onChange={(e) => setSettingsForm({ ...settingsForm, best_of_sets: parseInt(e.target.value) })}
                  className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm"
                >
                  <option value={5}>Best of 5 (3 Gewinnsätze)</option>
                  <option value={3}>Best of 3 (2 Gewinnsätze)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 font-medium">Admin-PIN (Passcode)</label>
              <input
                type="text"
                value={settingsForm.admin_pin}
                onChange={(e) => setSettingsForm({ ...settingsForm, admin_pin: e.target.value })}
                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm font-mono"
              />
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white font-bold px-6 py-2.5 rounded-xl text-sm shadow-lg shadow-sky-500/20 transition"
              >
                <Save className="w-4 h-4" />
                <span>Änderungen speichern</span>
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
