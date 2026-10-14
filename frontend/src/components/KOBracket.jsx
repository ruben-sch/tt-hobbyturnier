import React, { useState, useEffect, useCallback } from 'react';
import { fetchRounds, advanceKoRound } from '../services/api';
import { Trophy, GitFork, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function KOBracket({ tournament, isAdmin, onRoundChange }) {
  const [koRounds, setKoRounds] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadKORounds = useCallback(async () => {
    try {
      const allRounds = await fetchRounds(tournament.id);
      const kos = allRounds.filter(r => r.round_type === 'ko');
      setKoRounds(kos);
    } catch (e) {
      console.error(e);
    }
  }, [tournament]);

  useEffect(() => {
    if (tournament?.id) {
      loadKORounds();
    }
  }, [tournament, loadKORounds]);

  const handleAdvance = async () => {
    if (!confirm("Nächste KO-Runde mit den Siegern der aktuellen Runde generieren?")) return;
    try {
      setLoading(true);
      await advanceKoRound(tournament.id);
      await loadKORounds();
      onRoundChange && onRoundChange();
    } catch (e) {
      alert("Fehler: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const lastKoRound = koRounds[koRounds.length - 1];
  const canAdvance = isAdmin && lastKoRound && 
    lastKoRound.team_matches.length > 1 && 
    lastKoRound.team_matches.every(m => m.is_completed);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      
      {/* Title & Advance Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2">
            <GitFork className="w-7 h-7 text-sky-400" />
            <span>KO-Endrunde (Turnierbaum)</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Best of 5 Matches (vorzeitiges Ende bei 3 Siegen). Bei 2:2 Gleichstand: Entscheidungsdoppel.
          </p>
        </div>

        {canAdvance && (
          <button
            onClick={handleAdvance}
            disabled={loading}
            className="flex items-center gap-2 bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-xl shadow-sky-500/25 transition disabled:opacity-50"
          >
            <span>Folgerunde starten ({lastKoRound.ko_stage === 'Viertelfinale' ? 'Halbfinale' : 'Finale'})</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {koRounds.length === 0 ? (
        <div className="bg-slate-800/50 border border-slate-700/60 rounded-3xl p-12 text-center max-w-xl mx-auto">
          <Trophy className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-white mb-2">
            Die KO-Runde wurde noch nicht gestartet
          </h3>
          <p className="text-sm text-slate-400">
            Schließe die Vorrunden im Schweizer System ab und starte die KO-Phase über die Turnierleitung.
          </p>
        </div>
      ) : (
        /* BRACKET TREE COLUMNS */
        <div className="flex flex-col lg:flex-row gap-8 items-start justify-start overflow-x-auto pb-6">
          {koRounds.map((round) => (
            <div key={round.id} className="min-w-[280px] sm:min-w-[320px] flex-1 flex flex-col gap-6">
              
              {/* Stage Header */}
              <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3 text-center">
                <span className="text-xs uppercase font-extrabold tracking-wider text-sky-400">
                  {round.ko_stage || `KO-Runde ${round.round_number}`}
                </span>
                <span className="text-xs text-slate-400 block mt-0.5">
                  {round.team_matches.length} {round.team_matches.length === 1 ? 'Finale' : 'Begegnungen'}
                </span>
              </div>

              {/* Match Cards */}
              <div className="flex flex-col gap-6">
                {round.team_matches.map((match) => {
                  const winnerA = match.is_completed && match.score_a > match.score_b;
                  const winnerB = match.is_completed && match.score_b > match.score_a;
                  const hasDoubles = match.individual_games.some(g => g.is_doubles);

                  return (
                    <div
                      key={match.id}
                      className={`bg-slate-900/90 rounded-2xl border transition-all overflow-hidden shadow-xl ${
                        match.is_completed
                          ? 'border-slate-700/80'
                          : 'border-sky-500/40 shadow-sky-500/5'
                      }`}
                    >
                      <div className="p-2.5 bg-slate-800/60 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                        <span className="font-semibold text-sky-400">
                          {match.match_pin ? `PIN: ${match.match_pin}` : `Match #${match.ko_slot || match.id}`}
                        </span>
                        {hasDoubles && (
                          <span className="bg-amber-500/20 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                            Entscheidungsdoppel!
                          </span>
                        )}
                        {match.is_completed && (
                          <span className="text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Beendet
                          </span>
                        )}
                      </div>

                      {/* Team A */}
                      <div className={`p-3.5 flex items-center justify-between transition ${
                        winnerA ? 'bg-emerald-950/30 font-bold' : ''
                      }`}>
                        <div>
                          <div className={`text-sm ${winnerA ? 'text-emerald-400 font-bold' : 'text-slate-100'}`}>
                            {match.team_a?.name || "TBD"}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {match.team_a_p1_name} & {match.team_a_p2_name}
                          </div>
                        </div>
                        <span className={`font-mono text-xl font-black ${
                          winnerA ? 'text-emerald-400' : 'text-slate-300'
                        }`}>
                          {match.score_a}
                        </span>
                      </div>

                      <div className="h-px bg-slate-800" />

                      {/* Team B */}
                      <div className={`p-3.5 flex items-center justify-between transition ${
                        winnerB ? 'bg-emerald-950/30 font-bold' : ''
                      }`}>
                        <div>
                          <div className={`text-sm ${winnerB ? 'text-emerald-400 font-bold' : 'text-slate-100'}`}>
                            {match.team_b?.name || "TBD"}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {match.team_b_p1_name} & {match.team_b_p2_name}
                          </div>
                        </div>
                        <span className={`font-mono text-xl font-black ${
                          winnerB ? 'text-emerald-400' : 'text-slate-300'
                        }`}>
                          {match.score_b}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          ))}
        </div>
      )}

    </div>
  );
}
