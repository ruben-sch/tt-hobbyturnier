import React, { useState, useEffect, useCallback } from 'react';
import { fetchRounds } from '../services/api';
import { useLiveEvent, MATCH_EVENTS } from '../hooks/useLiveEvents';
import { History, CheckCircle2, Coffee } from 'lucide-react';

const gameLabel = (g) => (g.is_doubles ? 'D' : `E${g.game_order}`);

function tableLabel(m) {
  if (!m.table_number) return null;
  return m.table_number_b ? `Tisch ${m.table_number}+${m.table_number_b}` : `Tisch ${m.table_number}`;
}

function TeamRow({ team, p1, p2, score, won, draw }) {
  return (
    <div className={`p-3 flex items-center justify-between gap-3 ${won ? 'bg-emerald-950/30' : ''}`}>
      <div className="min-w-0">
        <div className={`text-sm truncate ${won ? 'text-emerald-400 font-bold' : 'text-slate-100'}`}>
          {team?.name || 'TBD'}
        </div>
        <div className="text-[11px] text-slate-400 truncate">{p1} & {p2}</div>
      </div>
      <span className={`font-mono text-xl font-black ${won ? 'text-emerald-400' : draw ? 'text-amber-400' : 'text-slate-300'}`}>
        {score}
      </span>
    </div>
  );
}

function MatchCard({ match, index }) {
  if (match.is_bye) {
    return (
      <div className="bg-slate-900/90 rounded-2xl border border-slate-700/80 p-3.5 flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-sm text-slate-100 truncate">{match.team_a?.name}</div>
          <div className="text-[11px] text-slate-400 truncate">
            {match.team_a_p1_name} & {match.team_a_p2_name}
          </div>
        </div>
        <span className="flex items-center gap-1 text-xs font-semibold text-slate-400">
          <Coffee className="w-3.5 h-3.5" />
          Freilos
        </span>
      </div>
    );
  }

  const winnerA = match.is_completed && match.score_a > match.score_b;
  const winnerB = match.is_completed && match.score_b > match.score_a;
  const draw = match.is_completed && match.score_a === match.score_b;
  const games = [...match.individual_games].sort((a, b) => a.game_order - b.game_order);

  return (
    <div data-testid="history-match" className="bg-slate-900/90 rounded-2xl border border-slate-700/80 overflow-hidden shadow-xl">
      <div className="p-2.5 bg-slate-800/60 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <span className="font-semibold text-sky-400">
          {tableLabel(match) || `Spiel ${index + 1}`}
        </span>
        {draw ? (
          <span className="text-amber-400 font-bold text-[11px]">Unentschieden</span>
        ) : match.is_completed && (
          <span className="text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Beendet
          </span>
        )}
      </div>

      <TeamRow team={match.team_a} p1={match.team_a_p1_name} p2={match.team_a_p2_name}
        score={match.score_a} won={winnerA} draw={draw} />
      <div className="h-px bg-slate-800" />
      <TeamRow team={match.team_b} p1={match.team_b_p1_name} p2={match.team_b_p2_name}
        score={match.score_b} won={winnerB} draw={draw} />

      {games.length > 0 && (
        <div className="border-t border-slate-800 bg-slate-950/40 px-2 py-1.5 flex flex-col gap-0.5">
          {games.map((g) => {
            const winA = g.is_completed && g.sets_won_a > g.sets_won_b;
            const winB = g.is_completed && g.sets_won_b > g.sets_won_a;
            return (
              <div key={g.id} data-testid="history-game"
                className="grid grid-cols-[1.75rem_1fr_auto_1fr] items-center gap-2 text-xs">
                <span className="font-mono font-bold text-slate-500">{gameLabel(g)}</span>
                <span className={`truncate text-right ${winA ? 'text-emerald-300 font-bold' : 'text-slate-300'}`}>
                  {g.player_a_name}
                </span>
                <span className="min-w-[2.5rem] text-center font-mono font-bold text-white">
                  {g.is_completed ? `${g.sets_won_a}:${g.sets_won_b}` : <span className="text-slate-600">–</span>}
                </span>
                <span className={`truncate ${winB ? 'text-emerald-300 font-bold' : 'text-slate-300'}`}>
                  {g.player_b_name}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Completed Swiss rounds with their pairings and results, newest selected first.
export default function RoundHistory({ tournament }) {
  const [rounds, setRounds] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const loadRounds = useCallback(async () => {
    try {
      const all = await fetchRounds(tournament.id);
      setRounds(all.filter((r) => r.round_type === 'swiss' && r.is_completed));
    } catch (e) {
      console.error(e);
    }
  }, [tournament]);

  useEffect(() => {
    if (tournament?.id) loadRounds();
  }, [tournament, loadRounds]);

  useLiveEvent(MATCH_EVENTS, loadRounds);

  // Keep the chosen round if it still exists, otherwise show the latest one.
  const selected = rounds.find((r) => r.id === selectedId) || rounds[rounds.length - 1];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2">
          <History className="w-7 h-7 text-sky-400" />
          <span>Vergangene Runden</span>
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Paarungen und Ergebnisse der abgeschlossenen Runden im Schweizer System.
        </p>
      </div>

      {!selected ? (
        <div className="bg-slate-800/50 border border-slate-700/60 rounded-3xl p-12 text-center max-w-xl mx-auto">
          <History className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-white mb-2">Noch keine abgeschlossene Runde</h3>
          <p className="text-sm text-slate-400">
            Sobald eine Runde beendet ist, erscheinen hier ihre Paarungen und Ergebnisse.
          </p>
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Runde wählen" className="flex flex-wrap gap-2 mb-6">
            {rounds.map((r) => {
              const active = r.id === selected.id;
              return (
                <button
                  key={r.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedId(r.id)}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold border transition ${
                    active
                      ? 'bg-sky-500 text-white border-sky-400 shadow-md shadow-sky-500/25'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:text-white hover:bg-slate-700/60'
                  }`}
                >
                  Runde {r.round_number}
                </button>
              );
            })}
          </div>

          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3 text-center mb-6">
            <span className="text-xs uppercase font-extrabold tracking-wider text-sky-400">
              Runde {selected.round_number}
            </span>
            <span className="text-xs text-slate-400 block mt-0.5">
              {selected.team_matches.filter((m) => !m.is_bye).length} Begegnungen
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {selected.team_matches.map((m, idx) => (
              <MatchCard key={m.id} match={m} index={idx} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
