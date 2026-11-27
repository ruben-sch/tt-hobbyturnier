import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  fetchLiveMatches, 
  fetchMatch, 
  submitGameResult
} from '../services/api';
import { useLiveEvent, MATCH_EVENTS } from '../hooks/useLiveEvents';
import { 
  Trophy, 
  ListOrdered
} from 'lucide-react';

// Result entry for the Turnierleitung; App only shows it once the admin PIN is set.
// Shows the open rounds of every running tournament mixed, each match labelled
// with its tournament, so match sheets of all classes can be typed in without switching.
export default function TableScorer({ tournaments }) {
  const [matches, setMatches] = useState([]);
  const [selected, setSelected] = useState(null); // tile of the open match (tournament, best of)
  const [matchData, setMatchData] = useState(null);
  const [activeGameId, setActiveGameId] = useState(null);
  const showTournament = new Set(matches.map((m) => m.tournament_id)).size > 1 || (tournaments?.length ?? 0) > 1;

  // Depends on `tournaments` so it refetches whenever App reloads them (new round, reconnect).
  const loadMatches = useCallback(async () => {
    try {
      setMatches(await fetchLiveMatches());
    } catch (e) {
      console.error(e);
    }
  }, [tournaments]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refreshes the open match after changes from other devices. Only matchData
  // is replaced: selected game and typed-in sets stay as they are.
  const openMatchIdRef = useRef(null);
  useEffect(() => {
    openMatchIdRef.current = matchData?.id ?? null;
  }, [matchData]);

  const refreshOpenMatch = useCallback(async () => {
    const matchId = openMatchIdRef.current;
    if (!matchId) return;
    try {
      const data = await fetchMatch(matchId);
      if (openMatchIdRef.current === matchId) setMatchData(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadMatches();
    refreshOpenMatch();
  }, [loadMatches, refreshOpenMatch]);

  useLiveEvent(MATCH_EVENTS, (msg) => {
    loadMatches();
    // ROUND_UPDATED (swapped pairings) carries no match_id but can change the open match
    if (msg.type === 'ROUND_UPDATED' || msg.match_id === openMatchIdRef.current) {
      refreshOpenMatch();
    }
  });

  const loadMatch = async (matchId, targetGameId = null) => {
    try {
      const data = await fetchMatch(matchId);
      setMatchData(data);
      if (data) {
        if (targetGameId) {
          const target = data.individual_games.find(g => g.id === targetGameId);
          if (target) {
            setActiveGameId(target.id);
            return data;
          }
        }

        // Set default active game (first uncompleted)
        const uncompleted = data.individual_games.find(g => !g.is_completed);
        const target = uncompleted || data.individual_games[0];
        if (target) {
          setActiveGameId(target.id);
        }
      }
      return data;
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectMatch = (tile) => {
    setSelected(tile);
    loadMatch(tile.match_id);
  };

  const handleSelectGame = (game) => {
    setActiveGameId(game.id);
  };

  const activeGame = matchData?.individual_games?.find(g => g.id === activeGameId);

  // Valid final set counts, e.g. best of 5: A wins 3:0 3:1 3:2, B wins 0:3 1:3 2:3
  const setsToWin = selected?.best_of_sets === 3 ? 2 : 3;
  const resultOptions = (side) => Array.from({ length: setsToWin }, (_, loserSets) => (
    side === 'A' ? [setsToWin, loserSets] : [loserSets, setsToWin]
  ));

  const handleResult = async (setsA, setsB) => {
    if (!activeGame || !matchData) return;
    const isReset = setsA === 0 && setsB === 0;
    try {
      await submitGameResult(matchData.id, activeGame.id, setsA, setsB);
      const updatedMatch = await fetchMatch(matchData.id);
      setMatchData(updatedMatch);
      loadMatches();
      if (isReset) return;

      // Find the next game in order (e.g. Einzel 2 after Einzel 1) or next uncompleted
      const currentIndex = updatedMatch.individual_games.findIndex(g => g.id === activeGame.id);
      let nextGame = null;
      if (currentIndex >= 0 && currentIndex + 1 < updatedMatch.individual_games.length) {
        nextGame = updatedMatch.individual_games[currentIndex + 1];
      } else {
        nextGame = updatedMatch.individual_games.find(g => !g.is_completed) || updatedMatch.individual_games[0];
      }

      if (nextGame) {
        setActiveGameId(nextGame.id);
      }
    } catch (err) {
      alert("Fehler: " + err.message);
    }
  };

  // Paarung n counts within the tournament's round, as on the monitor and the match sheets.
  const numberInRound = (m) => matches.filter((x) => x.tournament_id === m.tournament_id && x.match_id <= m.match_id).length;
  const openCount = matches.filter((m) => !m.is_completed).length;

  // If no match is selected yet
  if (!matchData) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            Ergebniseingabe
          </h2>
          <p className="text-slate-400">
            Wähle die Begegnung aus, deren Ergebnis du eintragen willst.
          </p>
        </div>

        {/* Match Selector Grid */}
        <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <span>Begegnungen der laufenden Runden</span>
          <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700">
            {openCount} offen
          </span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {matches.map((m) => {
            const isOpen = !m.is_completed;
            return (
              <div
                key={m.match_id}
                data-testid="match-tile"
                data-active={isOpen ? 'true' : 'false'}
                data-tournament={m.tournament_name}
                onClick={() => handleSelectMatch(m)}
                className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                  isOpen
                    ? 'bg-slate-800/90 border-sky-500/50 hover:border-sky-400 hover:shadow-lg hover:shadow-sky-500/10'
                    : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="font-bold text-lg text-white whitespace-nowrap">
                    Paarung {numberInRound(m)}
                  </span>
                  {showTournament && (
                    <span className="min-w-0 text-xs font-semibold bg-sky-500/15 text-sky-300 px-2.5 py-1 rounded-md border border-sky-500/30 truncate">
                      {m.tournament_name}
                    </span>
                  )}
                </div>
                <div className="text-sm font-semibold text-sky-400 mb-1">
                  {m.team_a_name} vs. {m.team_b_name}
                </div>
                <div className="text-xs text-slate-400 truncate">
                  {isOpen ? (m.active_game_desc || 'Spiel läuft...') : 'Beendet – antippen zum Korrigieren'}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs bg-slate-900/60 p-2 rounded-lg border border-slate-700/40">
                  <span className="text-slate-400">Spielstand:</span>
                  <span className="font-bold font-mono text-emerald-400 text-sm">
                    {m.score_a ?? 0} : {m.score_b ?? 0}
                  </span>
                </div>
              </div>
            );
          })}
          {matches.length === 0 && (
            <div className="col-span-full bg-slate-800/40 border border-dashed border-slate-700 rounded-2xl p-6 text-center text-slate-500">
              Aktuell läuft keine Runde.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4">
      {/* Top Bar Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => { setMatchData(null); setSelected(null); }}
          className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1"
        >
          ← Begegnungsauswahl
        </button>
        <div className="flex items-center gap-1 text-xs font-semibold text-slate-400">
          <ListOrdered className="w-3.5 h-3.5" />
          Ergebniseingabe
        </div>
      </div>

      {/* Match Overview Header */}
      <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 sm:p-5 mb-5 shadow-lg">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <span className="font-semibold text-sky-400">
            Begegnung
          </span>
          {selected?.tournament_name && (
            <span className="bg-slate-900 px-2 py-0.5 rounded text-slate-300 border border-slate-700/60 truncate">
              {selected.tournament_name}
            </span>
          )}
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
              onClick={() => handleSelectGame(g)}
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
        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 sm:p-8">
          <h4 className="font-bold text-lg text-white mb-2">
            Ergebnis eintragen ({activeGame.player_a_name} vs. {activeGame.player_b_name})
          </h4>
          <p className="text-xs text-slate-400 mb-6">
            Tippe auf den Endstand in Sätzen – das Ergebnis wird sofort gespeichert.
          </p>

          {activeGame.is_completed && (
            <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-xl p-4 text-center mb-4">
              <div className="font-bold text-emerald-400 flex items-center justify-center gap-2">
                <Trophy className="w-5 h-5" />
                <span>
                  Spiel beendet! Sieger: {activeGame.winner_team_side === "A" ? activeGame.player_a_name : activeGame.player_b_name}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {['A', 'B'].map((side) => (
              <div key={side} className="bg-slate-900/60 p-3 rounded-xl border border-slate-700/60">
                <div className="text-xs font-semibold text-slate-400 mb-2 truncate">
                  Sieg {side === 'A' ? activeGame.player_a_name || 'A' : activeGame.player_b_name || 'B'}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {resultOptions(side).map(([a, b]) => {
                    const isCurrent = activeGame.is_completed && activeGame.sets_won_a === a && activeGame.sets_won_b === b;
                    return (
                      <button
                        key={`${a}:${b}`}
                        type="button"
                        onClick={() => handleResult(a, b)}
                        aria-pressed={isCurrent}
                        className={`py-3.5 rounded-xl font-mono text-lg font-black transition ${
                          isCurrent
                            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                            : 'bg-slate-800 border border-slate-700 text-white hover:bg-sky-500 hover:border-sky-500'
                        }`}
                      >
                        {a}:{b}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {activeGame.is_completed && (
              <button
                type="button"
                onClick={() => handleResult(0, 0)}
                className="w-full mt-2 text-xs font-semibold text-slate-400 hover:text-rose-300 py-2 transition"
              >
                Ergebnis zurücksetzen
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
