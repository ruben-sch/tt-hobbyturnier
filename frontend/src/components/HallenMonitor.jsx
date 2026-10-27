import React, { useState, useEffect, useCallback } from 'react';
import { fetchMonitorDashboard } from '../services/api';
import { useLiveEvent, MATCH_EVENTS, TEAM_EVENTS } from '../hooks/useLiveEvents';
import { useAppBaseUrl, monitorUrl } from '../hooks/useAppBaseUrl';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Maximize2, 
  RefreshCw, 
  Activity, 
  Trophy, 
  Clock,
  CheckCircle2
} from 'lucide-react';

export default function HallenMonitor({ tournament }) {
  const [data, setData] = useState(null);
  const [viewMode, setViewMode] = useState('split'); // 'split', 'auto', 'tables', 'standings'
  const [autoIndex, setAutoIndex] = useState(0); // 0: tables, 1: standings, 2: ko
  const [intervalSec] = useState(15);
  const baseUrl = useAppBaseUrl();

  const loadData = useCallback(async () => {
    try {
      const res = await fetchMonitorDashboard(tournament.id);
      setData(res);
    } catch (e) {
      console.error(e);
    }
  }, [tournament]);

  useEffect(() => {
    if (tournament?.id) {
      loadData();
    }
  }, [tournament, loadData]);

  useLiveEvent([...MATCH_EVENTS, ...TEAM_EVENTS], loadData);

  // Auto-carousel timer
  useEffect(() => {
    if (viewMode === 'auto') {
      const carouselTimer = setInterval(() => {
        setAutoIndex((prev) => (prev + 1) % (data?.ko_tree?.length ? 3 : 2));
      }, intervalSec * 1000);
      return () => clearInterval(carouselTimer);
    }
  }, [viewMode, intervalSec, data]);


  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen().catch(console.error);
    }
  };

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin text-sky-400" />
          <span>Lade Hallen-Monitor Daten...</span>
        </div>
      </div>
    );
  }

  // Finished matches of the round stay on screen, marked as done
  const matches = data.matches || [];
  const openCount = matches.filter(m => !m.is_completed).length;
  const cardState = (m) => m.is_completed
    ? 'border-emerald-500/70 opacity-60'
    : 'border-sky-500/50';
  const gameInfo = (m) => m.is_completed ? (
    <span className="flex items-center gap-1 text-xs font-bold text-emerald-400 uppercase">
      <CheckCircle2 className="w-4 h-4" />
      <span>Fertig</span>
    </span>
  ) : (
    <span className="text-xs text-slate-400 truncate max-w-[150px]">
      {m.active_game_desc || 'Spiel läuft'}
    </span>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-3 sm:p-6 select-none">
      
      {/* Top Header / Status bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white uppercase">
              {data.tournament_name}
            </h1>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="font-semibold text-emerald-400">
                {data.round_type === 'ko' ? `KO-Runde: ${data.ko_stage || 'Endphase'}` : `Schweizer System • Runde ${data.current_round}`}
              </span>
              <span>•</span>
              <span>{openCount} aktive Paarungen</span>
            </div>
          </div>
        </div>

        {/* View Mode Controls */}
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs">
          <button
            onClick={() => setViewMode('split')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              viewMode === 'split' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Split-Screen
          </button>
          <button
            onClick={() => setViewMode('auto')}
            className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1 ${
              viewMode === 'auto' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Auto ({intervalSec}s)</span>
          </button>
          <button
            onClick={() => setViewMode('tables')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              viewMode === 'tables' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Aktuelle Paarungen
          </button>
          <button
            onClick={() => setViewMode('standings')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              viewMode === 'standings' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Nur Tabelle
          </button>

          <button
            onClick={toggleFullscreen}
            title="Vollbild"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        {/* QR code for players: opens the live scores on their phone */}
        {baseUrl && (
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl p-2 pr-4">
            <div className="bg-white p-1.5 rounded-lg">
              <QRCodeSVG
                value={monitorUrl(baseUrl)}
                size={88}
                title="QR-Code zur Spielstandsanzeige"
                data-testid="monitor-qr"
                data-url={monitorUrl(baseUrl)}
              />
            </div>
            <div className="text-xs">
              <div className="font-bold text-sky-400 uppercase tracking-wide">Live-Spielstände</div>
              <div className="text-slate-400">QR-Code mit dem Handy scannen</div>
              <div className="font-mono text-slate-500 mt-1">{baseUrl.replace(/^https?:\/\//, '')}</div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 py-4">
        {/* SPLIT SCREEN MODE */}
        {viewMode === 'split' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
            {/* Left 7 Cols: Active Matches */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-sky-400 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>Aktuelle Paarungen</span>
                </h2>
                <span className="text-xs text-slate-500">
                  Live Spielstände
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {matches.map((t, idx) => (
                  <div
                    key={t.match_id}
                    data-testid="monitor-match"
                    data-completed={t.is_completed}
                    className={`bg-slate-900/90 border-2 ${cardState(t)} rounded-2xl p-4 shadow-xl shadow-sky-500/5 relative overflow-hidden`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="bg-sky-500 text-slate-950 font-black text-xs px-2.5 py-0.5 rounded-md">
                        BEGEGNUNG {idx + 1}
                      </span>
                      {gameInfo(t)}
                    </div>

                    {/* Teams with the big live match score in between */}
                    <div className="flex items-center justify-between gap-3 my-3">
                      <span className="flex-1 font-bold text-base text-white truncate">
                        {t.team_a_name}
                      </span>
                      <div className="bg-slate-950/80 rounded-xl px-3 py-1.5 border border-slate-800 font-mono text-3xl font-black text-emerald-400 tracking-wider whitespace-nowrap">
                        {t.score_a} : {t.score_b}
                      </div>
                      <span className="flex-1 font-bold text-base text-white truncate text-right">
                        {t.team_b_name}
                      </span>
                    </div>
                  </div>
                ))}

                {matches.length === 0 && (
                  <div className="col-span-2 bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl p-8 text-center text-slate-500">
                    Aktuell keine laufenden Begegnungen.
                  </div>
                )}
              </div>
            </div>

            {/* Right 5 Cols: Swiss Standings or KO Tree */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <Trophy className="w-4 h-4" />
                  <span>{data.round_type === 'ko' ? "KO-Turnierbaum" : "Aktuelle Tabelle"}</span>
                </h2>
                <span className="text-xs text-slate-500">
                  {data.round_type === 'ko' ? "Endrunde" : "Schweizer System"}
                </span>
              </div>

              {data.round_type === 'ko' ? (
                /* Compact KO Tree */
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-4">
                  {data.ko_tree?.map((stage, idx) => (
                    <div key={idx} className="space-y-2">
                      <div className="text-xs font-bold text-sky-400 uppercase tracking-wide">
                        {stage.stage}
                      </div>
                      {stage.matches.map((m, mIdx) => (
                        <div key={mIdx} className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs">
                          <span className={m.winner_team_id && m.score_a > m.score_b ? "font-bold text-emerald-400" : "text-slate-300"}>
                            {m.team_a}
                          </span>
                          <span className="font-mono font-bold text-sky-400 px-2">
                            {m.score_a} : {m.score_b}
                          </span>
                          <span className={m.winner_team_id && m.score_b > m.score_a ? "font-bold text-emerald-400" : "text-slate-300"}>
                            {m.team_b}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                /* Compact Standings Table */
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-800/80 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="p-2.5 text-center">#</th>
                        <th className="p-2.5">Team</th>
                        <th className="p-2.5 text-center">Sp.</th>
                        <th className="p-2.5 text-center">Punkte</th>
                        <th className="p-2.5 text-center">Buchh.</th>
                        <th className="p-2.5 text-center">Satz</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {data.standings?.slice(0, 10).map((row) => (
                        <tr key={row.team_id} className="hover:bg-slate-800/40">
                          <td className="p-2.5 text-center font-bold text-sky-400">
                            {row.rank}
                          </td>
                          <td className="p-2.5 font-semibold text-white truncate max-w-[140px]">
                            {row.team_name}
                          </td>
                          <td className="p-2.5 text-center text-slate-400">
                            {row.won_matches}-{row.drawn_matches}-{row.lost_matches}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-emerald-400">
                            {row.game_points}
                          </td>
                          <td className="p-2.5 text-center font-mono text-slate-300">
                            {row.buchholz}
                          </td>
                          <td className="p-2.5 text-center font-mono text-slate-400">
                            {row.set_diff > 0 ? `+${row.set_diff}` : row.set_diff}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* FULLSCREEN AUTO CAROUSEL OR SINGLE VIEWS */}
        {(viewMode === 'tables' || (viewMode === 'auto' && autoIndex === 0)) && (
          <div>
            <h2 className="text-xl font-bold text-sky-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
              <span>Laufende Begegnungen & Spielstände</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {matches.map((t, idx) => (
                <div
                  key={t.match_id}
                  data-testid="monitor-match"
                  data-completed={t.is_completed}
                  className={`bg-slate-900 border-2 ${cardState(t)} rounded-2xl p-5 shadow-2xl relative`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="bg-sky-500 text-slate-950 font-black text-sm px-3 py-1 rounded-md">
                      BEGEGNUNG {idx + 1}
                    </span>
                    {gameInfo(t)}
                  </div>

                  <div className="space-y-2 my-4">
                    <div className="font-bold text-lg text-white truncate">
                      {t.team_a_name}
                    </div>
                    <div className="font-bold text-lg text-white truncate">
                      {t.team_b_name}
                    </div>
                  </div>

                  <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block mb-1">
                      Spielstand
                    </span>
                    <div className="font-mono text-4xl font-black text-emerald-400">
                      {t.score_a} : {t.score_b}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(viewMode === 'standings' || (viewMode === 'auto' && autoIndex === 1)) && (
          <div>
            <h2 className="text-xl font-bold text-emerald-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Trophy className="w-6 h-6" />
              <span>Gesamttabelle Schweizer System</span>
            </h2>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800 text-slate-400 font-semibold uppercase text-xs">
                  <tr>
                    <th className="p-3.5 text-center">Platz</th>
                    <th className="p-3.5">Mannschaft</th>
                    <th className="p-3.5">Spieler</th>
                    <th className="p-3.5 text-center">Matches</th>
                    <th className="p-3.5 text-center">Spielpunkte</th>
                    <th className="p-3.5 text-center">Buchholz</th>
                    <th className="p-3.5 text-center">Sätze</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {data.standings?.map((row) => (
                    <tr key={row.team_id} className="hover:bg-slate-800/50">
                      <td className="p-3.5 text-center font-bold text-sky-400 text-base">
                        {row.rank}
                      </td>
                      <td className="p-3.5 font-bold text-white text-base">
                        {row.team_name}
                      </td>
                      <td className="p-3.5 text-slate-400 text-xs">
                        {row.player1} & {row.player2}
                      </td>
                      <td className="p-3.5 text-center text-slate-300">
                        {row.won_matches}S - {row.drawn_matches}U - {row.lost_matches}N
                      </td>
                      <td className="p-3.5 text-center font-mono font-bold text-emerald-400 text-lg">
                        {row.game_points} : {row.game_points_lost}
                      </td>
                      <td className="p-3.5 text-center font-mono font-bold text-amber-400 text-base">
                        {row.buchholz}
                      </td>
                      <td className="p-3.5 text-center font-mono text-slate-300">
                        {row.sets_won}:{row.sets_lost} ({row.set_diff > 0 ? `+${row.set_diff}` : row.set_diff})
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Result Ticker (Durchlaufende vorherige Ergebnisse) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 mt-4 flex items-center overflow-hidden">
        <div className="flex items-center gap-2 px-3 text-xs font-bold text-sky-400 whitespace-nowrap border-r border-slate-700">
          <Activity className="w-3.5 h-3.5" />
          <span>LETZTE ERGEBNISSE:</span>
        </div>
        
        <div className="flex items-center gap-6 px-4 overflow-x-auto text-xs whitespace-nowrap text-slate-300 scrollbar-none animate-marquee">
          {data.ticker?.length > 0 ? (
            data.ticker.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-slate-400 font-medium">R{item.round_number}:</span>
                <span className="font-semibold text-white">{item.team_a}</span>
                <span className="font-mono font-bold text-emerald-400 px-1">{item.score}</span>
                <span className="font-semibold text-white">{item.team_b}</span>
                <span className="text-slate-700 mx-2">•</span>
              </div>
            ))
          ) : (
            <span className="text-slate-500 italic">Noch keine Spiele abgeschlossen.</span>
          )}
        </div>
      </div>

    </div>
  );
}
