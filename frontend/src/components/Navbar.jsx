import React from 'react';
import { 
  Tv, 
  Gamepad2, 
  Trophy, 
  GitFork, 
  Settings, 
  Printer, 
  Wifi, 
  WifiOff 
} from 'lucide-react';

export default function Navbar({ 
  currentTab, 
  setCurrentTab, 
  tournament, 
  isConnected 
}) {
  const navItems = [
    { id: 'monitor', label: 'Hallen-Monitor', icon: Tv },
    { id: 'scorer', label: 'Tisch-Zähler', icon: Gamepad2 },
    { id: 'standings', label: 'Tabelle', icon: Trophy },
    ...(tournament?.ko_enabled ? [{ id: 'bracket', label: 'KO-Baum', icon: GitFork }] : []),
    { id: 'admin', label: 'Turnierleitung', icon: Settings },
    { id: 'print', label: 'Spielzettel', icon: Printer },
  ];

  return (
    <header className="bg-slate-800/90 backdrop-blur border-b border-slate-700/60 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-6">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Tournament Info */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-sky-500/20 text-white font-bold text-xl">
              🏓
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base sm:text-lg text-slate-100 tracking-tight">
                  {tournament?.name || 'Tischtennis Turnier'}
                </span>
                {tournament?.current_round_number > 0 && (
                  <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/30">
                    Runde {tournament.current_round_number}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Schweizer System (2er-Teams) • Live-Manager
              </p>
            </div>
          </div>

          {/* Nav Tabs */}
          <nav className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto py-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentTab(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-sky-500 text-white shadow-md shadow-sky-500/25'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Connection Status indicator */}
          <div className="flex items-center gap-2 pl-2">
            <div 
              title={isConnected ? "Live WebSocket verbunden" : "Verbindung getrennt (versuche Reconnect)"}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border ${
                isConnected 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30 animate-pulse'
              }`}
            >
              {isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span className="hidden md:inline">{isConnected ? 'Live' : 'Offline'}</span>
            </div>
          </div>

        </div>
      </div>
    </header>
  );
}
