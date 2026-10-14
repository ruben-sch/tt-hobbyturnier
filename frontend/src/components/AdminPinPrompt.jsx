import React, { useState } from 'react';
import { verifyAdminPin, setAdminPin } from '../services/api';
import { Lock } from 'lucide-react';

export default function AdminPinPrompt({ tournament }) {
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const pin = pinInput.trim();
    if (!pin || !tournament?.id) return;
    setPinError('');
    setChecking(true);
    try {
      if (await verifyAdminPin(tournament.id, pin)) {
        setAdminPin(pin);
      } else {
        setPinError('Falsche Admin-PIN.');
      }
    } catch {
      setPinError('Fehler bei der PIN-Prüfung');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
          Turnierleitung
        </h2>
        <p className="text-slate-400">
          Dieser Bereich ist durch die Admin-PIN geschützt.
        </p>
      </div>

      <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 max-w-md mx-auto shadow-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <label htmlFor="admin-pin" className="block text-sm font-medium text-slate-300">
            Admin-PIN eingeben
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                id="admin-pin"
                type="password"
                autoComplete="current-password"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-11 pr-4 py-3 text-white placeholder-slate-500 font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <button
              type="submit"
              disabled={checking}
              className="bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-xl transition shadow-lg shadow-sky-500/20"
            >
              Entsperren
            </button>
          </div>
          {pinError && (
            <p className="text-rose-400 text-sm">{pinError}</p>
          )}
        </form>
      </div>
    </div>
  );
}
