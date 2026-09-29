import React, { useState, useEffect } from 'react';
import { 
  fetchTablesStatus, 
  authenticatePin, 
  fetchMatch, 
  setLineup, 
  updatePoint, 
  submitQuickResult 
} from '../services/api';
import { 
  KeyRound, 
  CheckCircle, 
  ArrowLeftRight, 
  RotateCcw, 
  Plus, 
  Minus, 
  Trophy, 
  ChevronRight, 
  Zap,
  ListOrdered
} from 'lucide-react';

export default function TableScorer({ tournament, onScoreChange }) {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [matchData, setMatchData] = useState(null);
  const [activeGameId, setActiveGameId] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [mode, setMode] = useState('live'); // 'live' or 'quick'
  
  // Lineup state
  const [lineupForm, setLineupForm] = useState({
    team_a_p1: '',
    team_a_p2: '',
    team_b_p1: '',
    team_b_p2: '',
  });

  // Quick results state
  const [quickSets, setQuickSets] = useState([
    { set_number: 1, score_a: '', score_b: '' },
    { set_number: 2, score_a: '', score_b: '' },
    { set_number: 3, score_a: '', score_b: '' },
    { set_number: 4, score_a: '', score_b: '' },
    { set_number: 5, score_a: '', score_b: '' },
  ]);

  useEffect(() => {
    if (tournament?.id) {
      loadTables();
    }
  }, [tournament]);

  const loadTables = async () => {
    try {
      const data = await fetchTablesStatus(tournament.id);
      setTables(data);
    } catch (e) {
      console.error(e);
    }
  };

  const loadMatch = async (matchId) => {
    try {
      const data = await fetchMatch(matchId);
      setMatchData(data);
      if (data) {
        setLineupForm({
          team_a_p1: data.team_a_p1_name || data.team_a?.player1_name || '',
          team_a_p2: data.team_a_p2_name || data.team_a?.player2_name || '',
          team_b_p1: data.team_b_p1_name || data.team_b?.player1_name || '',
          team_b_p2: data.team_b_p2_name || data.team_b?.player2_name || '',
        });

        // Set default active game (first uncompleted)
        const uncompleted = data.individual_games.find(g => !g.is_completed);
        setActiveGameId(uncompleted ? uncompleted.id : data.individual_games[0]?.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectTable = (tbl) => {
    setSelectedTable(tbl);
    if (tbl.current_team_match_id) {
      loadMatch(tbl.current_team_match_id);
    } else {
      setMatchData(null);
    }
  };

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    setPinError('');
    try {
      const res = await authenticatePin(tournament.id, pinInput);
      if (res.authenticated) {
        if (res.match_id) {
          await loadMatch(res.match_id);
          const tbl = tables.find(t => t.table_number === res.table_number) || { table_number: res.table_number };
          setSelectedTable(tbl);
        } else if (res.table_number) {
          const tbl = tables.find(t => t.table_number === res.table_number);
          if (tbl) handleSelectTable(tbl);
        }
        setPinInput('');
      } else {
        setPinError(res.message);
      }
    } catch (err) {
      setPinError('Fehler bei der PIN-Prüfung');
    }
  };

  const handleConfirmLineup = async () => {
    if (!matchData) return;
    try {
      const updated = await setLineup(matchData.id, {
        team_a_p1_name: lineupForm.team_a_p1,
        team_a_p2_name: lineupForm.team_a_p2,
        team_b_p1_name: lineupForm.team_b_p1,
        team_b_p2_name: lineupForm.team_b_p2,
      });
      setMatchData(updated);
      onScoreChange && onScoreChange();
    } catch (e) {
      alert("Fehler beim Bestätigen der Aufstellung: " + e.message);
    }
  };

  const activeGame = matchData?.individual_games?.find(g => g.id === activeGameId);

  const handlePointChange = async (deltaA, deltaB) => {
    if (!activeGame || !matchData || activeGame.is_completed) return;
    const newA = Math.max(0, activeGame.current_point_a + deltaA);
    const newB = Math.max(0, activeGame.current_point_b + deltaB);

    try {
      const updatedGame = await updatePoint(matchData.id, activeGame.id, {
        point_a: newA,
        point_b: newB,
        set_number: activeGame.current_set_index,
      });
      // Refresh match state
      await loadMatch(matchData.id);
      loadTables();
      onScoreChange && onScoreChange();
    } catch (e) {
      console.error(e);
    }
  };

  const handleQuickSubmit = async (e) => {
    e.preventDefault();
    if (!activeGame || !matchData) return;

    const validSets = quickSets
      .filter(s => s.score_a !== '' && s.score_b !== '')
      .map(s => ({
        set_number: s.set_number,
        score_a: parseInt(s.score_a, 10),
        score_b: parseInt(s.score_b, 10),
      }));

    if (validSets.length === 0) {
      alert("Bitte mindestens einen Satz eingeben.");
      return;
    }

    try {
      await submitQuickResult(matchData.id, activeGame.id, validSets);
      await loadMatch(matchData.id);
      loadTables();
      onScoreChange && onScoreChange();
      // Clear quick inputs
      setQuickSets([
        { set_number: 1, score_a: '', score_b: '' },
        { set_number: 2, score_a: '', score_b: '' },
        { set_number: 3, score_a: '', score_b: '' },
        { set_number: 4, score_a: '', score_b: '' },
        { set_number: 5, score_a: '', score_b: '' },
      ]);
    } catch (err) {
      alert("Fehler: " + err.message);
    }
  };

  // If no table or match is selected yet
  if (!matchData) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            Tisch-Erfassung & Schiedsrichter-Zähler
          </h2>
          <p className="text-slate-400">
            Wähle deinen Tisch aus oder gib die 4-stellige Tisch-PIN / Match-PIN ein.
          </p>
        </div>

        {/* PIN Entry Card */}
        <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 max-w-md mx-auto mb-10 shadow-xl">
          <form onSubmit={handlePinSubmit} className="space-y-4">
            <label className="block text-sm font-medium text-slate-300">
              PIN-Code eingeben
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  maxLength={10}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="z.B. 1001 oder Match-PIN"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-11 pr-4 py-3 text-white placeholder-slate-500 font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <button
                type="submit"
                className="bg-sky-500 hover:bg-sky-400 text-white font-semibold px-6 py-3 rounded-xl transition shadow-lg shadow-sky-500/20"
              >
                Start
              </button>
            </div>
            {pinError && (
              <p className="text-rose-400 text-sm">{pinError}</p>
            )}
          </form>
        </div>

        {/* Table Selector Grid */}
        <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <span>Verfügbare Tische</span>
          <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700">
            {tables.length} Tische
          </span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tables.map((t) => (
            <div
              key={t.table_number}
              onClick={() => handleSelectTable(t)}
              className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                t.is_active
                  ? 'bg-slate-800/90 border-sky-500/50 hover:border-sky-400 hover:shadow-lg hover:shadow-sky-500/10'
                  : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-lg text-white">
                  Tisch {t.table_number}
                </span>
                <span className="text-xs font-mono bg-slate-900/80 text-slate-400 px-2.5 py-1 rounded-md border border-slate-700">
                  PIN: {t.pin_code}
                </span>
              </div>

              {t.is_active ? (
                <div>
                  <div className="text-sm font-semibold text-sky-400 mb-1">
                    {t.team_a_name} vs. {t.team_b_name}
                  </div>
                  <div className="text-xs text-slate-400 truncate">
                    {t.active_game_desc || 'Spiel läuft...'}
                  </div>
                  {t.current_point_a !== undefined && (
                    <div className="mt-3 flex items-center justify-between text-xs bg-slate-900/60 p-2 rounded-lg border border-slate-700/40">
                      <span className="text-slate-400">Aktueller Satz:</span>
                      <span className="font-bold font-mono text-emerald-400 text-sm">
                        {t.current_point_a} : {t.current_point_b}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-500 italic py-2">
                  Aktuell kein Spiel zugewiesen
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // If Lineup is NOT confirmed yet: Show Aufstellung Screen
  if (!matchData.lineup_confirmed) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={() => { setMatchData(null); setSelectedTable(null); }}
          className="text-xs text-slate-400 hover:text-white mb-4 inline-flex items-center gap-1"
        >
          ← Zurück zur Tischauswahl
        </button>

        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 sm:p-8 shadow-2xl">
          <div className="text-center mb-6">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/30 mb-2">
              Tisch {matchData.table_number || selectedTable?.table_number} • Vor dem Spiel
            </span>
            <h2 className="text-2xl font-bold text-white">
              Aufstellung festlegen
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Wer spielt an Position 1 und Position 2? (Reihenfolge: Kreuzspiele 1-2, 2-1, danach 1-1, 2-2)
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
            {/* Team A */}
            <div className="bg-slate-900/80 p-5 rounded-2xl border border-sky-500/30">
              <h3 className="font-bold text-sky-400 text-lg mb-3">
                {matchData.team_a?.name}
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium">Spieler 1 (Pos. 1)</label>
                  <select
                    value={lineupForm.team_a_p1}
                    onChange={(e) => {
                      const p1 = e.target.value;
                      const p2 = p1 === matchData.team_a?.player1_name ? matchData.team_a?.player2_name : matchData.team_a?.player1_name;
                      setLineupForm({ ...lineupForm, team_a_p1: p1, team_a_p2: p2 });
                    }}
                    className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  >
                    <option value={matchData.team_a?.player1_name}>{matchData.team_a?.player1_name}</option>
                    <option value={matchData.team_a?.player2_name}>{matchData.team_a?.player2_name}</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium">Spieler 2 (Pos. 2)</label>
                  <input
                    type="text"
                    disabled
                    value={lineupForm.team_a_p2}
                    className="w-full mt-1 bg-slate-800/50 border border-slate-700/60 rounded-xl px-3 py-2 text-slate-300 text-sm cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* Team B */}
            <div className="bg-slate-900/80 p-5 rounded-2xl border border-emerald-500/30">
              <h3 className="font-bold text-emerald-400 text-lg mb-3">
                {matchData.team_b?.name || "Gegner"}
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium">Spieler 1 (Pos. 1)</label>
                  <select
                    value={lineupForm.team_b_p1}
                    onChange={(e) => {
                      const p1 = e.target.value;
                      const p2 = p1 === matchData.team_b?.player1_name ? matchData.team_b?.player2_name : matchData.team_b?.player1_name;
                      setLineupForm({ ...lineupForm, team_b_p1: p1, team_b_p2: p2 });
                    }}
                    className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value={matchData.team_b?.player1_name}>{matchData.team_b?.player1_name}</option>
                    <option value={matchData.team_b?.player2_name}>{matchData.team_b?.player2_name}</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium">Spieler 2 (Pos. 2)</label>
                  <input
                    type="text"
                    disabled
                    value={lineupForm.team_b_p2}
                    className="w-full mt-1 bg-slate-800/50 border border-slate-700/60 rounded-xl px-3 py-2 text-slate-300 text-sm cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={handleConfirmLineup}
            className="w-full bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 text-white font-bold py-4 rounded-2xl shadow-xl shadow-sky-500/25 transition text-lg flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-6 h-6" />
            <span>Aufstellung bestätigen & Begegnung freigeben</span>
          </button>
        </div>
      </div>
    );
  }

  // Lineup is confirmed: Full Scorer Interface
  const currentSetPoints = activeGame ? (activeGame.current_point_a + activeGame.current_point_b) : 0;
  // Serve changes every 2 points, or every point if >= 20 total points (10:10 deuce)
  const isDeuce = activeGame ? (activeGame.current_point_a >= 10 && activeGame.current_point_b >= 10) : false;
  const isServerA = isDeuce ? (currentSetPoints % 2 === 0) : (Math.floor(currentSetPoints / 2) % 2 === 0);

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4">
      {/* Top Bar Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => { setMatchData(null); setSelectedTable(null); }}
          className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1"
        >
          ← Tischauswahl
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode('live')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${
              mode === 'live' ? 'bg-sky-500 text-white shadow-md' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            Live-Zähler
          </button>
          <button
            onClick={() => setMode('quick')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${
              mode === 'quick' ? 'bg-sky-500 text-white shadow-md' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5" />
            Schnelleingabe
          </button>
        </div>
      </div>

      {/* Match Overview Header */}
      <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 sm:p-5 mb-5 shadow-lg">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <span className="font-semibold text-sky-400">
            Tisch {matchData.table_number || selectedTable?.table_number}
          </span>
          <span className="font-mono bg-slate-900 px-2 py-0.5 rounded text-slate-400 border border-slate-700/60">
            PIN: {matchData.match_pin}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h3 className="font-bold text-base sm:text-xl text-white">
              {matchData.team_a?.name}
            </h3>
            <p className="text-xs text-slate-400">
              {matchData.team_a_p1_name} & {matchData.team_a_p2_name}
            </p>
          </div>

          <div className="px-4 text-center">
            <div className="font-mono text-3xl sm:text-4xl font-black tracking-widest text-emerald-400">
              {matchData.score_a} : {matchData.score_b}
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
              {matchData.is_completed ? "Beendet" : "Gesamtstand"}
            </span>
          </div>

          <div className="flex-1 text-right">
            <h3 className="font-bold text-base sm:text-xl text-white">
              {matchData.team_b?.name || "BYE"}
            </h3>
            <p className="text-xs text-slate-400">
              {matchData.team_b_p1_name} & {matchData.team_b_p2_name}
            </p>
          </div>
        </div>
      </div>

      {/* Individual Games Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        {matchData.individual_games.map((g) => {
          const isSelected = g.id === activeGameId;
          const orderLabel = g.is_doubles ? "5. Doppel" : `${g.game_order}. Einzel`;
          return (
            <button
              key={g.id}
              onClick={() => setActiveGameId(g.id)}
              className={`p-3 rounded-xl border text-left transition-all ${
                isSelected
                  ? 'bg-sky-500/10 border-sky-500 text-white shadow-md'
                  : g.is_completed
                  ? 'bg-slate-800/60 border-slate-700/80 text-slate-400'
                  : 'bg-slate-800/30 border-slate-700/40 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold text-sky-400">{orderLabel}</span>
                <span className="font-mono font-bold text-slate-200">
                  {g.sets_won_a} : {g.sets_won_b}
                </span>
              </div>
              <div className="text-xs truncate font-medium text-slate-300">
                {g.player_a_name || 'A'}
              </div>
              <div className="text-xs truncate text-slate-400">
                vs. {g.player_b_name || 'B'}
              </div>
              {g.is_completed && (
                <div className="text-[10px] text-emerald-400 font-semibold mt-1">
                  ✓ Abgeschlossen
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ACTIVE GAME SCORER */}
      {activeGame && (
        <div>
          {mode === 'live' ? (
            /* LIVE TOUCH SCOREBOARD */
            <div className="bg-slate-800/90 border border-slate-700 rounded-3xl p-4 sm:p-8 shadow-2xl">
              <div className="flex items-center justify-between text-sm text-slate-400 mb-4 pb-3 border-b border-slate-700/60">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-base">
                    {activeGame.is_doubles ? "Entscheidungsdoppel" : `Einzel ${activeGame.game_order}`}
                  </span>
                  <span className="bg-sky-500/20 text-sky-300 text-xs px-2.5 py-0.5 rounded-full font-semibold">
                    Satz {activeGame.current_set_index}
                  </span>
                </div>
                <div className="flex items-center gap-1 font-mono text-xs">
                  {activeGame.set_scores.filter(s => s.is_completed).map((s, idx) => (
                    <span key={idx} className="bg-slate-900 px-2 py-1 rounded text-slate-300">
                      {s.score_a}:{s.score_b}
                    </span>
                  ))}
                </div>
              </div>

              {/* Big Interactive Score Box */}
              <div className="grid grid-cols-2 gap-3 sm:gap-6 mb-6">
                
                {/* Player A Box */}
                <div className={`p-4 sm:p-6 rounded-2xl border text-center transition-all flex flex-col justify-between ${
                  isServerA ? 'bg-sky-950/40 border-sky-500/50 shadow-lg shadow-sky-500/10' : 'bg-slate-900/60 border-slate-700/60'
                }`}>
                  <div>
                    <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-sky-400 mb-1">
                      {isServerA && <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />}
                      <span>{isServerA ? 'Aufschlag' : ''}</span>
                    </div>
                    <div className="font-bold text-base sm:text-xl text-white truncate mb-2">
                      {activeGame.player_a_name}
                    </div>
                    <div className="text-xs text-slate-400 font-medium">
                      Sätze: <span className="text-white font-bold">{activeGame.sets_won_a}</span>
                    </div>
                  </div>

                  <div className="my-6">
                    <span className="font-mono text-6xl sm:text-8xl font-black text-white tracking-tighter">
                      {activeGame.current_point_a}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePointChange(1, 0)}
                      disabled={activeGame.is_completed}
                      className="flex-1 bg-sky-500 hover:bg-sky-400 active:scale-95 disabled:opacity-50 text-white font-black py-4 sm:py-5 rounded-xl text-2xl shadow-lg shadow-sky-500/25 flex items-center justify-center transition"
                    >
                      <Plus className="w-8 h-8" />
                    </button>
                    <button
                      onClick={() => handlePointChange(-1, 0)}
                      disabled={activeGame.is_completed || activeGame.current_point_a === 0}
                      className="bg-slate-800 hover:bg-slate-700 active:scale-95 disabled:opacity-40 text-slate-300 p-3 sm:p-4 rounded-xl flex items-center justify-center transition"
                    >
                      <Minus className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Player B Box */}
                <div className={`p-4 sm:p-6 rounded-2xl border text-center transition-all flex flex-col justify-between ${
                  !isServerA ? 'bg-emerald-950/40 border-emerald-500/50 shadow-lg shadow-emerald-500/10' : 'bg-slate-900/60 border-slate-700/60'
                }`}>
                  <div>
                    <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-400 mb-1">
                      {!isServerA && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />}
                      <span>{!isServerA ? 'Aufschlag' : ''}</span>
                    </div>
                    <div className="font-bold text-base sm:text-xl text-white truncate mb-2">
                      {activeGame.player_b_name}
                    </div>
                    <div className="text-xs text-slate-400 font-medium">
                      Sätze: <span className="text-white font-bold">{activeGame.sets_won_b}</span>
                    </div>
                  </div>

                  <div className="my-6">
                    <span className="font-mono text-6xl sm:text-8xl font-black text-white tracking-tighter">
                      {activeGame.current_point_b}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePointChange(0, 1)}
                      disabled={activeGame.is_completed}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-400 active:scale-95 disabled:opacity-50 text-white font-black py-4 sm:py-5 rounded-xl text-2xl shadow-lg shadow-emerald-500/25 flex items-center justify-center transition"
                    >
                      <Plus className="w-8 h-8" />
                    </button>
                    <button
                      onClick={() => handlePointChange(0, -1)}
                      disabled={activeGame.is_completed || activeGame.current_point_b === 0}
                      className="bg-slate-800 hover:bg-slate-700 active:scale-95 disabled:opacity-40 text-slate-300 p-3 sm:p-4 rounded-xl flex items-center justify-center transition"
                    >
                      <Minus className="w-5 h-5" />
                    </button>
                  </div>
                </div>

              </div>

              {activeGame.is_completed && (
                <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-xl p-4 text-center">
                  <div className="font-bold text-emerald-400 flex items-center justify-center gap-2">
                    <Trophy className="w-5 h-5" />
                    <span>
                      Spiel beendet! Sieger: {activeGame.winner_team_side === "A" ? activeGame.player_a_name : activeGame.player_b_name}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* QUICK RESULT ENTRY */
            <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 sm:p-8">
              <h4 className="font-bold text-lg text-white mb-2">
                Schnellergebnis eintragen ({activeGame.player_a_name} vs. {activeGame.player_b_name})
              </h4>
              <p className="text-xs text-slate-400 mb-6">
                Gib die Satzergebnisse direkt ein (z. B. Satz 1: 11:9).
              </p>

              <form onSubmit={handleQuickSubmit} className="space-y-3">
                {quickSets.map((s, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-700/60">
                    <span className="w-16 text-xs font-semibold text-slate-400">
                      Satz {s.set_number}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={40}
                      placeholder="0"
                      value={s.score_a}
                      onChange={(e) => {
                        const copy = [...quickSets];
                        copy[idx].score_a = e.target.value;
                        setQuickSets(copy);
                      }}
                      className="w-20 bg-slate-800 border border-slate-700 rounded-lg p-2 text-center text-white font-mono font-bold"
                    />
                    <span className="text-slate-500 font-bold">:</span>
                    <input
                      type="number"
                      min={0}
                      max={40}
                      placeholder="0"
                      value={s.score_b}
                      onChange={(e) => {
                        const copy = [...quickSets];
                        copy[idx].score_b = e.target.value;
                        setQuickSets(copy);
                      }}
                      className="w-20 bg-slate-800 border border-slate-700 rounded-lg p-2 text-center text-white font-mono font-bold"
                    />
                  </div>
                ))}

                <button
                  type="submit"
                  className="w-full mt-4 bg-sky-500 hover:bg-sky-400 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-sky-500/20 transition"
                >
                  Ergebnis speichern
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
