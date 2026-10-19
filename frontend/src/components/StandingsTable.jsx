import React, { useState, useEffect, useCallback } from 'react';
import { fetchStandings } from '../services/api';
import { useLiveEvent, MATCH_EVENTS, TEAM_EVENTS } from '../hooks/useLiveEvents';
import { Trophy, Download, Search, Info } from 'lucide-react';

export default function StandingsTable({ tournament }) {
  const [standings, setStandings] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadStandings = useCallback(async () => {
    try {
      // No loading state on refetches, so live updates don't flicker
      const data = await fetchStandings(tournament.id);
      setStandings(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [tournament]);

  useEffect(() => {
    if (tournament?.id) {
      loadStandings();
    }
  }, [tournament, loadStandings]);

  useLiveEvent([...MATCH_EVENTS, ...TEAM_EVENTS], loadStandings);

  const filtered = standings.filter(s => 
    s.team_name.toLowerCase().includes(search.toLowerCase()) ||
    s.player1.toLowerCase().includes(search.toLowerCase()) ||
    s.player2.toLowerCase().includes(search.toLowerCase())
  );

  const handleExportCsv = () => {
    window.open(`/api/tournaments/${tournament.id}/export/csv`, '_blank');
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2">
            <Trophy className="w-7 h-7 text-amber-400" />
            <span>Tabelle (Schweizer System)</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Sortiert nach: 1. Spielpunkte, 2. Buchholz-Wertung, 3. Satzdifferenz
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Search box */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Team oder Spieler suchen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2 rounded-xl text-sm font-semibold transition"
          >
            <Download className="w-4 h-4" />
            <span>CSV Export</span>
          </button>
        </div>
      </div>

      {/* Info Alert on Buchholz */}
      <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-3.5 mb-6 text-xs text-sky-300 flex items-start gap-2.5">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <b>Buchholz-Zahl:</b> Die Summe der gewonnenen Spielpunkte aller bisherigen Gegner eines Teams. Je höher die Buchholz-Zahl, desto stärkere Gegner hatte die Mannschaft (Feinwertung bei gleicher Punktzahl).
        </div>
      </div>

      {/* Standings Table */}
      <div className="bg-slate-800/80 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/90 text-slate-400 font-semibold uppercase text-xs tracking-wider border-b border-slate-700">
              <tr>
                <th className="p-3.5 text-center">Platz</th>
                <th className="p-3.5">Mannschaft</th>
                <th className="p-3.5">Spieler</th>
                <th className="p-3.5 text-center">Spiele</th>
                <th className="p-3.5 text-center">S - U - N</th>
                <th className="p-3.5 text-center text-emerald-400">Spielpunkte</th>
                <th className="p-3.5 text-center text-amber-400">Buchholz</th>
                <th className="p-3.5 text-center">Sätze</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {filtered.map((row) => (
                <tr key={row.team_id} className="hover:bg-slate-700/30 transition">
                  <td className="p-3.5 text-center">
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full font-bold text-xs ${
                      row.rank === 1 ? 'bg-amber-400 text-slate-950 font-black' :
                      row.rank === 2 ? 'bg-slate-300 text-slate-950 font-black' :
                      row.rank === 3 ? 'bg-amber-700 text-white font-black' :
                      'text-slate-300'
                    }`}>
                      {row.rank}
                    </span>
                  </td>
                  <td className="p-3.5 font-bold text-white text-base">
                    {row.team_name}
                  </td>
                  <td className="p-3.5 text-slate-400 text-xs">
                    {row.player1} & {row.player2}
                  </td>
                  <td className="p-3.5 text-center font-medium text-slate-300">
                    {row.matches_played}
                  </td>
                  <td className="p-3.5 text-center text-slate-400 text-xs font-mono">
                    {row.won_matches} - {row.drawn_matches} - {row.lost_matches}
                  </td>
                  <td className="p-3.5 text-center font-mono font-bold text-emerald-400 text-base">
                    {row.game_points} : {row.game_points_lost}
                  </td>
                  <td className="p-3.5 text-center font-mono font-bold text-amber-400">
                    {row.buchholz}
                  </td>
                  <td className="p-3.5 text-center font-mono text-slate-300">
                    {row.sets_won} : {row.sets_lost}
                    <span className="text-xs text-slate-500 ml-1">
                      ({row.set_diff > 0 ? `+${row.set_diff}` : row.set_diff})
                    </span>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500">
                    {loading ? "Lade Tabelle..." : "Keine Einträge gefunden."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
