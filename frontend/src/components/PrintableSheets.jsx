import React, { useState, useEffect, useCallback } from 'react';
import { fetchRounds } from '../services/api';
import { useLiveEvent, MATCH_EVENTS, TEAM_EVENTS } from '../hooks/useLiveEvents';
import { useAppBaseUrl, scorerUrl } from '../hooks/useAppBaseUrl';
import { QRCodeSVG } from 'qrcode.react';
import { Printer } from 'lucide-react';

// Four sheets per A4 page (2x2). The page box is the printable area of A4
// minus the 10mm @page margin from index.css (1mm spare in height so
// rounding never spills onto an empty extra page).
const SHEETS_PER_PAGE = 4;

// Singles order of a team match: [game, player of A, player of B].
const SINGLES = [
  [1, 1, 2],
  [2, 2, 1],
  [3, 1, 1],
  [4, 2, 2],
];

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function playerName(match, side, number) {
  return match[`team_${side}_p${number}_name`] || match[`team_${side}`]?.[`player${number}_name`];
}

// Recorded set count of a game, blank if it has not been played yet.
function setsCell(match, gameOrder) {
  const game = match.individual_games?.find(g => g.game_order === gameOrder);
  if (!game || (game.sets_won_a === 0 && game.sets_won_b === 0)) return ' : ';
  return `${game.sets_won_a} : ${game.sets_won_b}`;
}

function MatchSheet({ tournament, round, match, number, baseUrl }) {
  const roundLabel = round.round_type === 'ko' ? round.ko_stage : 'Schweizer System';

  return (
    <div className="flex flex-col p-[5mm] border border-dashed border-neutral-400 overflow-hidden">
      {/* Sheet Header */}
      <div className="border-b-2 border-black pb-1.5 mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-black border-2 border-black px-2 py-0.5 inline-block rounded">
            BEGEGNUNG #{number}
          </div>
          <p className="text-[9px] text-neutral-600 mt-1 leading-tight">
            {tournament.name} • Runde {round.round_number} ({roundLabel})
          </p>
          <p className="text-[9px] text-neutral-500 font-mono leading-tight">
            Match-PIN: {match.match_pin}
          </p>
        </div>
        {baseUrl && (
          <QRCodeSVG
            value={scorerUrl(baseUrl, match.id)}
            size={56}
            className="shrink-0"
            data-testid="sheet-qr"
            data-url={scorerUrl(baseUrl, match.id)}
            title={`QR-Code zur Ergebniseingabe für Begegnung #${number}`}
          />
        )}
      </div>

      {/* Teams & Aufstellung Info */}
      <div className="grid grid-cols-2 gap-2 border border-black p-1.5 mb-2 rounded">
        {['a', 'b'].map(side => (
          <div key={side} className="min-w-0">
            <span className="text-[8px] uppercase font-bold text-neutral-500 block">
              Mannschaft {side.toUpperCase()}
            </span>
            <span className="text-xs font-bold block truncate">{match[`team_${side}`]?.name}</span>
            <span className="text-[10px] text-neutral-700 block truncate">
              1: {playerName(match, side, 1) || '____________'}
            </span>
            <span className="text-[10px] text-neutral-700 block truncate">
              2: {playerName(match, side, 2) || '____________'}
            </span>
          </div>
        ))}
      </div>

      {/* Games Table */}
      <table className="w-full text-[11px] border-collapse border border-black table-fixed">
        <thead>
          <tr className="bg-neutral-100 text-center font-bold">
            <th className="border border-black p-1 w-6">Nr.</th>
            <th className="border border-black p-1 text-left">Spieler A</th>
            <th className="border border-black p-1 text-left">Spieler B</th>
            <th className="border border-black p-1 w-14">Sätze</th>
          </tr>
        </thead>
        <tbody>
          {SINGLES.map(([order, a, b]) => (
            <tr key={order}>
              <td className="border border-black px-1 py-3 text-center font-bold">{order}</td>
              <td className="border border-black px-1 py-3 truncate">A{a}: {playerName(match, 'a', a) || `Spieler A${a}`}</td>
              <td className="border border-black px-1 py-3 truncate">B{b}: {playerName(match, 'b', b) || `Spieler B${b}`}</td>
              <td className="border border-black px-1 py-3 text-center font-bold">{setsCell(match, order)}</td>
            </tr>
          ))}
          {round.round_type === 'ko' && (
            <tr className="bg-neutral-50">
              <td className="border border-black px-1 py-3 text-center font-bold">5</td>
              <td className="border border-black px-1 py-3 italic" colSpan={2}>
                Doppel (nur bei 2:2)
              </td>
              <td className="border border-black px-1 py-3 text-center font-bold">{setsCell(match, 5)}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-4 mt-auto pt-4 text-[9px] text-center">
        <div>
          <div className="border-b border-black mb-0.5"></div>
          <span className="text-neutral-600">Unterschrift Mannschaft A</span>
        </div>
        <div>
          <div className="border-b border-black mb-0.5"></div>
          <span className="text-neutral-600">Unterschrift Mannschaft B</span>
        </div>
      </div>
    </div>
  );
}

export default function PrintableSheets({ tournament }) {
  const [rounds, setRounds] = useState([]);
  const [selectedRoundId, setSelectedRoundId] = useState(null);
  const baseUrl = useAppBaseUrl();

  const loadRounds = useCallback(async (keepSelection = false) => {
    try {
      const data = await fetchRounds(tournament.id);
      setRounds(data);
      if (data.length > 0) {
        // Default to active round, or last round. Live updates within a
        // round keep the user's choice.
        const active = data.find(r => r.is_active);
        const fallback = active ? active.id : data[data.length - 1].id;
        setSelectedRoundId(prev => (keepSelection && data.some(r => r.id === prev) ? prev : fallback));
      }
    } catch (e) {
      console.error(e);
    }
  }, [tournament]);

  useEffect(() => {
    if (tournament?.id) {
      loadRounds();
    }
  }, [tournament, loadRounds]);

  useLiveEvent([...MATCH_EVENTS, ...TEAM_EVENTS], () => loadRounds(true));

  const currentRound = rounds.find(r => r.id === selectedRoundId);
  const matches = currentRound?.team_matches?.filter(m => !m.is_bye) || [];

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 print:p-0 print:max-w-none">

      {/* Controls (Hidden during print) */}
      <div className="print:hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <Printer className="w-6 h-6 text-sky-400" />
            <span>Spielberichtsbögen drucken</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Druckansicht für Spielzettel als Papier-Backup, 4 Zettel pro A4-Seite.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select
            value={selectedRoundId || ''}
            onChange={(e) => setSelectedRoundId(parseInt(e.target.value))}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm"
          >
            {rounds.map(r => (
              <option key={r.id} value={r.id}>
                Runde {r.round_number} ({r.round_type === 'ko' ? r.ko_stage : 'Schweizer System'})
              </option>
            ))}
          </select>

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white font-bold px-5 py-2 rounded-xl text-sm shadow-lg shadow-sky-500/20 transition"
          >
            <Printer className="w-4 h-4" />
            <span>Jetzt drucken</span>
          </button>
        </div>
      </div>

      {/* PRINTABLE PAGES: the screen preview matches the printed layout */}
      <div className="overflow-x-auto print:overflow-visible">
        <div className="space-y-8 print:space-y-0 w-[190mm] mx-auto">
          {chunk(matches, SHEETS_PER_PAGE).map((pageMatches, pIdx) => (
            <div
              key={pIdx}
              className="bg-white text-black w-[190mm] h-[276mm] grid grid-cols-2 grid-rows-2 shadow-xl print:shadow-none break-after-page last:break-after-auto"
            >
              {pageMatches.map((match, i) => (
                <MatchSheet
                  key={match.id}
                  tournament={tournament}
                  round={currentRound}
                  match={match}
                  number={pIdx * SHEETS_PER_PAGE + i + 1}
                  baseUrl={baseUrl}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
