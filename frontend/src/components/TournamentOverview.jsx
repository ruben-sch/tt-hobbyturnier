import React, { useState } from 'react';
import { createTournament } from '../services/api';
import { Tv, Trophy, Plus, Archive, RefreshCw } from 'lucide-react';
import { formatLabel } from '../lib/tournamentFormat';

// Start page, also where the monitor QR code leads: players pick their class
// (running tournament) and open its live scores or standings. Abgeschlossene
// tournaments stay below as history. The Turnierleitung creates new ones here.
export default function TournamentOverview({ tournaments, isAdmin, onOpen }) {
  const [newName, setNewName] = useState('');
  const [newSingles, setNewSingles] = useState(false); // Einzelturnier instead of 2er-Teams; fixed once created
  const [newBestOf, setNewBestOf] = useState(5);
  const [creating, setCreating] = useState(false);

  if (!tournaments) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] gap-3 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin text-sky-400" />
        <span>Lade Turniere...</span>
      </div>
    );
  }

  const running = tournaments.filter((t) => t.is_active);
  const closed = tournaments.filter((t) => !t.is_active);

  const handleCreate = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    try {
      setCreating(true);
      const created = await createTournament({ name, is_singles: newSingles, best_of_sets: newBestOf });
      setNewName('');
      setNewSingles(false);
      setNewBestOf(5);
      onOpen(created.id, 'admin');
    } catch (err) {
      alert("Fehler: " + err.message);
    } finally {
      setCreating(false);
    }
  };

  const roundInfo = (t) => (t.current_round_number > 0 ? `Runde ${t.current_round_number}` : 'Noch keine Runde');

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Turniere</h2>
        <p className="text-slate-400">Wähle deine Klasse, um die Live-Spielstände oder die Tabelle zu sehen.</p>
      </div>

      <h3 className="text-lg font-semibold text-slate-200 mb-3">Laufende Turniere</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {running.map((t) => (
          <div
            key={t.id}
            data-testid="tournament-card"
            className="bg-slate-800/90 border border-sky-500/40 rounded-2xl p-5"
          >
            <div className="font-bold text-xl text-white truncate">{t.name}</div>
            <div className="text-sm text-slate-400 mb-4"><span>{formatLabel(t)}</span> • <span>{roundInfo(t)}</span></div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onOpen(t.id, 'monitor')}
                className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-400 text-white font-semibold px-4 py-2 rounded-xl text-sm transition"
              >
                <Tv className="w-4 h-4" />
                <span>Live-Spielstände</span>
              </button>
              <button
                type="button"
                onClick={() => onOpen(t.id, 'standings')}
                className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-white font-semibold px-4 py-2 rounded-xl text-sm transition"
              >
                <Trophy className="w-4 h-4" />
                <span>Tabelle</span>
              </button>
            </div>
          </div>
        ))}
        {running.length === 0 && (
          <div className="col-span-full bg-slate-800/40 border border-dashed border-slate-700 rounded-2xl p-6 text-center text-slate-500">
            Aktuell läuft kein Turnier.
          </div>
        )}
      </div>

      {isAdmin && (
        <form onSubmit={handleCreate} className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5 mb-8">
          <label htmlFor="new-tournament" className="font-semibold text-slate-200 block mb-1">
            Neues Turnier (z. B. eine weitere Klasse)
          </label>
          <p className="text-xs text-slate-400 mb-3">
            Läuft neben den anderen; Teams bzw. Spieler danach unter „Turnierleitung“. Die Spielform lässt sich
            später nicht mehr ändern, die Gewinnsätze schon.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            <label className="text-xs text-slate-400 font-medium">
              Spielform
              <select
                value={newSingles ? 'singles' : 'teams'}
                onChange={(e) => setNewSingles(e.target.value === 'singles')}
                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm"
              >
                <option value="teams">2er-Teams (4 Einzel pro Begegnung)</option>
                <option value="singles">Einzelturnier (1 Spiel pro Begegnung)</option>
              </select>
            </label>
            <label className="text-xs text-slate-400 font-medium">
              Gewinnsätze
              <select
                value={newBestOf}
                onChange={(e) => setNewBestOf(parseInt(e.target.value))}
                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm"
              >
                <option value={5}>3 Gewinnsätze (Best of 5)</option>
                <option value={3}>2 Gewinnsätze (Best of 3)</option>
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <input
              id="new-tournament"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Turniername"
              className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm"
            />
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl text-sm transition"
            >
              <Plus className="w-4 h-4" />
              <span>Anlegen</span>
            </button>
          </div>
        </form>
      )}

      {closed.length > 0 && (
        <>
          <h3 className="text-lg font-semibold text-slate-200 mb-3 flex items-center gap-2">
            <Archive className="w-5 h-5 text-slate-400" />
            <span>Abgeschlossene Turniere</span>
          </h3>
          <ul className="divide-y divide-slate-800 bg-slate-800/40 border border-slate-700/60 rounded-2xl">
            {closed.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-200 truncate">{t.name}</div>
                  <div className="text-xs text-slate-500">
                    {t.created_at ? new Date(t.created_at).toLocaleDateString('de-DE') : ''} • {roundInfo(t)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpen(t.id, 'standings')}
                  className="shrink-0 text-sm font-semibold text-sky-400 hover:text-sky-300"
                >
                  Ansehen
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
