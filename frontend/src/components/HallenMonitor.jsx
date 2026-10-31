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

// Scales rem with the screen: 16px up to Full HD, about 30px on a 4K TV in
// fullscreen (bounded by the height, so the split view with 8 matches fits
// without scrolling). The layout is sized in rem, so it fills a 4K screen the same way
// it fills a Full HD one, and phones keep the normal 16px.
export const MONITOR_FONT_SIZE = 'max(16px, min(40px, 100vw / 120, 100vh / 78))';

const gameLabel = (g) => (g.is_doubles ? 'D' : `E${g.game_order}`);

// The table(s) a match is played on, or its number in the round before tables are assigned.
function tableLabel(m, idx) {
  if (!m.table_number) return { caption: 'Spiel', value: `${idx + 1}` };
  return { caption: 'Tisch', value: m.table_number_b ? `${m.table_number}+${m.table_number_b}` : `${m.table_number}` };
}

// One game of a match: who plays whom and its set count, the running one highlighted.
function GameRow({ game }) {
  const winA = game.is_completed && game.sets_a > game.sets_b;
  const winB = game.is_completed && game.sets_b > game.sets_a;
  const name = (won) => (won
    ? 'text-emerald-300 font-bold'
    : game.is_completed || game.is_running ? 'text-slate-100' : 'text-slate-500');
  return (
    <div
      data-testid="monitor-game"
      data-running={game.is_running}
      className={`grid grid-cols-[1.5rem_1fr_auto_1fr] sm:grid-cols-[2.25rem_1fr_auto_1fr] items-center gap-1.5 sm:gap-2 rounded-lg px-1 sm:px-2 py-0.5 text-sm sm:text-lg ${
        game.is_running ? 'bg-sky-500/20 ring-1 ring-sky-400/60' : ''
      }`}
    >
      <span className={`font-mono font-bold text-xs sm:text-base ${game.is_running ? 'text-sky-300' : 'text-slate-500'}`}>
        {gameLabel(game)}
      </span>
      <span className={`truncate text-right ${name(winA)}`}>{game.player_a_name}</span>
      <span className="min-w-[3.5rem] sm:min-w-[4.5rem] text-center font-mono font-bold">
        {game.is_completed ? (
          <span className="text-white">{game.sets_a}:{game.sets_b}</span>
        ) : game.is_running ? (
          <span className="inline-flex items-center gap-1.5 text-sky-300 text-sm sm:text-base uppercase">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            läuft
          </span>
        ) : (
          <span className="text-slate-600">–</span>
        )}
      </span>
      <span className={`truncate ${name(winB)}`}>{game.player_b_name}</span>
    </div>
  );
}

// A match of the round: table, teams, live match score and its singles.
function MatchCard({ match: m, idx }) {
  const games = m.games || [];
  const table = tableLabel(m, idx);
  return (
    <div
      data-testid="monitor-match"
      data-completed={m.is_completed}
      className={`bg-slate-900/90 border-2 ${
        m.is_completed ? 'border-emerald-500/70 opacity-60' : 'border-sky-500/50'
      } rounded-2xl p-3 shadow-xl shadow-sky-500/5`}
    >
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1">
        <span
          title={m.is_completed ? 'Fertig' : undefined}
          className={`w-full sm:w-auto sm:min-w-[3rem] flex sm:flex-col items-center gap-1 sm:gap-0 rounded-lg px-1.5 py-0.5 font-black uppercase whitespace-nowrap ${
            m.is_completed ? 'bg-emerald-500/15 text-emerald-400' : 'bg-sky-500/15 text-sky-400'
          }`}
        >
          <span className="flex items-center gap-1 text-xs">
            {m.is_completed && <CheckCircle2 className="w-3.5 h-3.5" />}
            {table.caption}
          </span>
          <span className="text-sm sm:text-xl leading-none">{table.value}</span>
          {m.is_completed && <span className="sm:hidden text-xs ml-1">Fertig</span>}
        </span>
        <span className="flex-1 min-w-0 font-bold text-lg sm:text-2xl text-white truncate text-right">
          {m.team_a_name}
        </span>
        <span className="bg-slate-950/80 rounded-xl px-2.5 border border-slate-800 font-mono text-3xl sm:text-4xl font-black text-emerald-400 whitespace-nowrap">
          {m.score_a}:{m.score_b}
        </span>
        <span className="flex-1 min-w-0 font-bold text-lg sm:text-2xl text-white truncate">
          {m.team_b_name}
        </span>
      </div>

      {games.length > 0 ? (
        <div className="mt-2 space-y-0.5">
          {games.map((g) => <GameRow key={g.game_order} game={g} />)}
        </div>
      ) : !m.is_completed && (
        <div className="mt-2 text-base text-slate-400 truncate">{m.active_game_desc || 'Spiel läuft'}</div>
      )}
    </div>
  );
}

export default function HallenMonitor({ tournament }) {
  const [data, setData] = useState(null);
  const [viewMode, setViewMode] = useState('split'); // 'split', 'auto', 'tables', 'standings'
  const [autoIndex, setAutoIndex] = useState(0); // 0: tables, 1: standings, 2: ko
  const [intervalSec] = useState(15);
  const baseUrl = useAppBaseUrl();

  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.fontSize;
    root.style.fontSize = MONITOR_FONT_SIZE;
    return () => { root.style.fontSize = previous; };
  }, []);

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

  const viewButton = (mode, label, icon = null) => (
    <button
      onClick={() => setViewMode(mode)}
      className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1 ${
        viewMode === mode ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  const noMatches = (
    <div className="col-span-full bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl p-8 text-center text-lg text-slate-500">
      Aktuell keine laufenden Begegnungen.
    </div>
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-950 text-slate-100 flex flex-col p-3 sm:p-4 lg:p-5 select-none">

      {/* Top Header / Status bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 shrink-0 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <Activity className="w-7 h-7 animate-pulse" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white uppercase truncate">
              {data.tournament_name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 text-sm sm:text-lg text-slate-400">
              <span className="font-semibold text-emerald-400">
                {data.round_type === 'ko' ? `KO-Runde: ${data.ko_stage || 'Endphase'}` : `Schweizer System • Runde ${data.current_round}`}
              </span>
              <span>•</span>
              <span>{openCount} aktive Paarungen</span>
            </div>
          </div>
        </div>

        {/* View Mode Controls */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs sm:text-sm">
          {viewButton('split', 'Split-Screen')}
          {viewButton('auto', `Auto (${intervalSec}s)`, <Clock className="w-3.5 h-3.5" />)}
          {viewButton('tables', 'Aktuelle Paarungen')}
          {viewButton('standings', 'Nur Tabelle')}
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
                size={160}
                style={{ width: '5.5rem', height: '5.5rem' }}
                title="QR-Code zur Spielstandsanzeige"
                data-testid="monitor-qr"
                data-url={monitorUrl(baseUrl)}
              />
            </div>
            <div className="text-sm">
              <div className="font-bold text-sky-400 uppercase tracking-wide">Live-Spielstände</div>
              <div className="text-slate-400">QR-Code mit dem Handy scannen</div>
              <div className="font-mono text-slate-500 mt-1">{baseUrl.replace(/^https?:\/\//, '')}</div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 py-3">
        {/* SPLIT SCREEN MODE */}
        {viewMode === 'split' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-full">
            {/* Left 8 Cols: matches of the round with their singles */}
            <div className="lg:col-span-8 flex flex-col gap-3">
              <h2 className="text-lg font-bold text-sky-400 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <span>Aktuelle Paarungen</span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {matches.map((m, idx) => <MatchCard key={m.match_id} match={m} idx={idx} />)}
                {matches.length === 0 && noMatches}
              </div>
            </div>

            {/* Right 4 Cols: Swiss Standings or KO Tree */}
            <div className="lg:col-span-4 flex flex-col gap-3">
              <h2 className="text-lg font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <Trophy className="w-5 h-5" />
                <span>{data.round_type === 'ko' ? "KO-Turnierbaum" : "Aktuelle Tabelle"}</span>
              </h2>

              {data.round_type === 'ko' ? (
                /* Compact KO Tree */
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-4">
                  {data.ko_tree?.map((stage, idx) => (
                    <div key={idx} className="space-y-2">
                      <div className="text-base font-bold text-sky-400 uppercase tracking-wide">
                        {stage.stage}
                      </div>
                      {stage.matches.map((m, mIdx) => (
                        <div key={mIdx} className="bg-slate-950 px-3 py-2 rounded-xl border border-slate-800/80 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-lg">
                          <span className={`truncate ${m.winner_team_id && m.score_a > m.score_b ? "font-bold text-emerald-400" : "text-slate-300"}`}>
                            {m.team_a}
                          </span>
                          <span className="font-mono font-bold text-sky-400 px-2 text-xl">
                            {m.score_a} : {m.score_b}
                          </span>
                          <span className={`truncate text-right ${m.winner_team_id && m.score_b > m.score_a ? "font-bold text-emerald-400" : "text-slate-300"}`}>
                            {m.team_b}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                /* Compact Standings Table: every team, so the whole field fits next to the matches */
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                  <table className="w-full text-left text-lg table-fixed">
                    <thead className="bg-slate-800/80 text-slate-400 font-semibold uppercase text-sm tracking-wider">
                      <tr>
                        <th className="w-12 px-2 py-2 text-center">#</th>
                        <th className="px-2 py-2">Team</th>
                        <th className="w-24 px-2 py-2 text-center">S-U-N</th>
                        <th className="w-16 px-2 py-2 text-center">Pkt.</th>
                        <th className="hidden sm:table-cell w-20 px-2 py-2 text-center">Buchh.</th>
                        <th className="hidden sm:table-cell w-16 px-2 py-2 text-center">Satz</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {data.standings?.map((row) => (
                        <tr key={row.team_id}>
                          <td className="px-2 py-1 text-center font-bold text-sky-400">
                            {row.rank}
                          </td>
                          <td className="px-2 py-1 font-bold text-white text-xl truncate">
                            {row.team_name}
                          </td>
                          <td className="px-2 py-1 text-center text-slate-400">
                            {row.won_matches}-{row.drawn_matches}-{row.lost_matches}
                          </td>
                          <td className="px-2 py-1 text-center font-mono font-bold text-emerald-400 text-xl">
                            {row.game_points}
                          </td>
                          <td className="hidden sm:table-cell px-2 py-1 text-center font-mono text-slate-300">
                            {row.buchholz}
                          </td>
                          <td className="hidden sm:table-cell px-2 py-1 text-center font-mono text-slate-400">
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
            <h2 className="text-2xl font-bold text-sky-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
              <span>Laufende Begegnungen & Spielstände</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {matches.map((m, idx) => <MatchCard key={m.match_id} match={m} idx={idx} />)}
              {matches.length === 0 && noMatches}
            </div>
          </div>
        )}

        {(viewMode === 'standings' || (viewMode === 'auto' && autoIndex === 1)) && (
          <div>
            <h2 className="text-2xl font-bold text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Trophy className="w-6 h-6" />
              <span>Gesamttabelle Schweizer System</span>
            </h2>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto shadow-2xl">
              <table className="w-full text-left text-xl">
                <thead className="bg-slate-800 text-slate-400 font-semibold uppercase text-base">
                  <tr>
                    <th className="px-4 py-2 text-center">Platz</th>
                    <th className="px-4 py-2">Mannschaft</th>
                    <th className="px-4 py-2">Spieler</th>
                    <th className="px-4 py-2 text-center">Matches</th>
                    <th className="px-4 py-2 text-center">Spielpunkte</th>
                    <th className="px-4 py-2 text-center">Buchholz</th>
                    <th className="px-4 py-2 text-center">Sätze</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {data.standings?.map((row) => (
                    <tr key={row.team_id}>
                      <td className="px-4 py-1.5 text-center font-bold text-sky-400 text-2xl">
                        {row.rank}
                      </td>
                      <td className="px-4 py-1.5 font-bold text-white text-2xl">
                        {row.team_name}
                      </td>
                      <td className="px-4 py-1.5 text-slate-400 text-lg">
                        {row.player1} & {row.player2}
                      </td>
                      <td className="px-4 py-1.5 text-center text-slate-300">
                        {row.won_matches}S - {row.drawn_matches}U - {row.lost_matches}N
                      </td>
                      <td className="px-4 py-1.5 text-center font-mono font-bold text-emerald-400 text-2xl">
                        {row.game_points} : {row.game_points_lost}
                      </td>
                      <td className="px-4 py-1.5 text-center font-mono font-bold text-amber-400 text-2xl">
                        {row.buchholz}
                      </td>
                      <td className="px-4 py-1.5 text-center font-mono text-slate-300">
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
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 flex items-center overflow-hidden">
        <div className="flex items-center gap-2 px-3 text-sm sm:text-base font-bold text-sky-400 whitespace-nowrap border-r border-slate-700">
          <Activity className="w-4 h-4" />
          <span>LETZTE ERGEBNISSE:</span>
        </div>

        <div className="flex items-center gap-6 px-4 overflow-x-auto text-sm sm:text-lg whitespace-nowrap text-slate-300 scrollbar-none animate-marquee">
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
