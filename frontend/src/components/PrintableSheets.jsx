import React, { useState, useEffect, useCallback } from 'react';
import { fetchRounds } from '../services/api';
import { useLiveEvent, MATCH_EVENTS, TEAM_EVENTS } from '../hooks/useLiveEvents';
import { useAppBaseUrl, scorerUrl } from '../hooks/useAppBaseUrl';
import { QRCodeSVG } from 'qrcode.react';
import { Printer } from 'lucide-react';

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

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      
      {/* Controls (Hidden during print) */}
      <div className="print:hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <Printer className="w-6 h-6 text-sky-400" />
            <span>Spielberichtsbögen drucken</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Druckansicht für Spielzettel als Papier-Backup.
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

      {/* PRINTABLE SHEETS CONTAINER */}
      <div className="space-y-8 print:space-y-0">
        {currentRound?.team_matches?.filter(m => m.team_b_id !== null).map((match, mIdx) => (
          <div 
            key={match.id}
            className="bg-white text-black p-6 sm:p-8 rounded-2xl print:rounded-none shadow-xl print:shadow-none border border-slate-300 print:border-black print:page-break-after-always mb-8 print:mb-0"
          >
            {/* Sheet Header */}
            <div className="border-b-2 border-black pb-3 mb-4 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-black uppercase tracking-tight">
                  Tischtennis Spielberichtsbogen
                </h1>
                <p className="text-xs text-neutral-600">
                  {tournament.name} • Runde {currentRound.round_number} ({currentRound.round_type === 'ko' ? currentRound.ko_stage : 'Schweizer System'})
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-base font-black border-2 border-black px-3 py-1 inline-block rounded">
                    BEGEGNUNG #{mIdx + 1}
                  </div>
                  <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
                    Match-PIN: {match.match_pin}
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">
                    Ergebnis per Handy: QR-Code scannen
                  </div>
                </div>
                {baseUrl && (
                  <QRCodeSVG
                    value={scorerUrl(baseUrl, match.id)}
                    size={72}
                    data-testid="sheet-qr"
                    data-url={scorerUrl(baseUrl, match.id)}
                    title={`QR-Code zur Ergebniseingabe für Begegnung #${mIdx + 1}`}
                  />
                )}
              </div>
            </div>

            {/* Teams & Aufstellung Info */}
            <div className="grid grid-cols-2 gap-4 border border-black p-3 mb-4 rounded">
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">Mannschaft A</span>
                <span className="text-base font-bold block">{match.team_a?.name}</span>
                <span className="text-xs text-neutral-700 block mt-1">
                  1: {match.team_a_p1_name || match.team_a?.player1_name || '________________'}
                </span>
                <span className="text-xs text-neutral-700 block">
                  2: {match.team_a_p2_name || match.team_a?.player2_name || '________________'}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">Mannschaft B</span>
                <span className="text-base font-bold block">{match.team_b?.name}</span>
                <span className="text-xs text-neutral-700 block mt-1">
                  1: {match.team_b_p1_name || match.team_b?.player1_name || '________________'}
                </span>
                <span className="text-xs text-neutral-700 block">
                  2: {match.team_b_p2_name || match.team_b?.player2_name || '________________'}
                </span>
              </div>
            </div>

            {/* Games Table */}
            <table className="w-full text-xs border-collapse border border-black mb-6">
              <thead>
                <tr className="bg-neutral-100 border-b border-black text-center font-bold">
                  <th className="border border-black p-2 w-8">Nr.</th>
                  <th className="border border-black p-2 text-left">Spieler A</th>
                  <th className="border border-black p-2 text-left">Spieler B</th>
                  <th className="border border-black p-2 w-20">Sätze</th>
                  <th className="border border-black p-2 w-20">Punkte</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-black">
                  <td className="border border-black p-2 text-center font-bold">1</td>
                  <td className="border border-black p-2">A1: {match.team_a_p1_name || 'Spieler A1'}</td>
                  <td className="border border-black p-2">B2: {match.team_b_p2_name || 'Spieler B2'}</td>
                  <td className="border border-black p-2 text-center font-bold"> : </td>
                  <td className="border border-black p-2 text-center font-bold"> : </td>
                </tr>
                <tr className="border-b border-black">
                  <td className="border border-black p-2 text-center font-bold">2</td>
                  <td className="border border-black p-2">A2: {match.team_a_p2_name || 'Spieler A2'}</td>
                  <td className="border border-black p-2">B1: {match.team_b_p1_name || 'Spieler B1'}</td>
                  <td className="border border-black p-2 text-center font-bold"> : </td>
                  <td className="border border-black p-2 text-center font-bold"> : </td>
                </tr>
                <tr className="border-b border-black">
                  <td className="border border-black p-2 text-center font-bold">3</td>
                  <td className="border border-black p-2">A1: {match.team_a_p1_name || 'Spieler A1'}</td>
                  <td className="border border-black p-2">B1: {match.team_b_p1_name || 'Spieler B1'}</td>
                  <td className="border border-black p-2 text-center font-bold"> : </td>
                  <td className="border border-black p-2 text-center font-bold"> : </td>
                </tr>
                <tr className="border-b border-black">
                  <td className="border border-black p-2 text-center font-bold">4</td>
                  <td className="border border-black p-2">A2: {match.team_a_p2_name || 'Spieler A2'}</td>
                  <td className="border border-black p-2">B2: {match.team_b_p2_name || 'Spieler B2'}</td>
                  <td className="border border-black p-2 text-center font-bold"> : </td>
                  <td className="border border-black p-2 text-center font-bold"> : </td>
                </tr>
                {currentRound.round_type === 'ko' && (
                  <tr className="border-b border-black bg-neutral-50">
                    <td className="border border-black p-2 text-center font-bold">5</td>
                    <td className="border border-black p-2 italic" colSpan={2}>
                      Entscheidungsdoppel (nur bei 2:2 Gleichstand)
                    </td>
                              <td className="border border-black p-2 text-center font-bold"> : </td>
                    <td className="border border-black p-2 text-center font-bold"> : </td>
                  </tr>
                )}
                {/* Total Line */}
                <tr className="bg-neutral-100 font-black">
                  <td className="border border-black p-2 text-right" colSpan={3}>
                    GESAMTERGEBNIS:
                  </td>
                  <td className="border border-black p-2 text-center font-bold text-sm">
                    {match.is_completed ? `${match.individual_games.reduce((acc, g) => acc + g.sets_won_a, 0)}:${match.individual_games.reduce((acc, g) => acc + g.sets_won_b, 0)}` : ' : '}
                  </td>
                  <td className="border border-black p-2 text-center font-black text-sm">
                    {match.is_completed ? `${match.score_a} : ${match.score_b}` : ' : '}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Signatures */}
            <div className="grid grid-cols-3 gap-6 pt-6 text-xs text-center">
              <div>
                <div className="border-b border-black pb-1 mb-1"></div>
                <span className="text-neutral-600">Unterschrift Mannschaft A</span>
              </div>
              <div>
                <div className="border-b border-black pb-1 mb-1"></div>
                <span className="text-neutral-600">Unterschrift Schiedsrichter</span>
              </div>
              <div>
                <div className="border-b border-black pb-1 mb-1"></div>
                <span className="text-neutral-600">Unterschrift Mannschaft B</span>
              </div>
            </div>

          </div>
        ))}
      </div>

    </div>
  );
}
