import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Navbar from './components/Navbar';
import HallenMonitor from './components/HallenMonitor';
import TableScorer from './components/TableScorer';
import StandingsTable from './components/StandingsTable';
import KOBracket from './components/KOBracket';
import AdminDashboard from './components/AdminDashboard';
import PrintableSheets from './components/PrintableSheets';
import AdminPinPrompt from './components/AdminPinPrompt';
import { fetchActiveTournament, getAdminPin, subscribeAdminPin, verifyAdminPin, setAdminPin } from './services/api';
import { useWebSocket } from './hooks/useWebSocket';
import { LiveEventsContext, TOURNAMENT_EVENTS, createLiveEvents } from './hooks/useLiveEvents';

const TABS = ['monitor', 'scorer', 'standings', 'bracket', 'admin', 'print'];

// The monitor QR code links to ?tab=monitor (see useAppBaseUrl).
function readDeepLinkTab() {
  const tab = new URLSearchParams(window.location.search).get('tab');
  return TABS.includes(tab) ? tab : 'monitor';
}

export default function App() {
  const [currentTab, setCurrentTab] = useState(readDeepLinkTab);
  const [tournament, setTournament] = useState(null);
  const liveEvents = useMemo(() => createLiveEvents(), []);
  const [isAdmin, setIsAdmin] = useState(() => Boolean(getAdminPin()));

  useEffect(() => subscribeAdminPin((pin) => setIsAdmin(Boolean(pin))), []);

  // A PIN remembered from earlier in this tab may be outdated (changed on
  // another device, or a new tournament): check it once the tournament is known.
  const tournamentId = tournament?.id;
  useEffect(() => {
    const pin = getAdminPin();
    if (!tournamentId || !pin) return;
    verifyAdminPin(tournamentId, pin)
      .then((ok) => { if (!ok) setAdminPin(null); })
      .catch(() => {});
  }, [tournamentId]);

  const loadTournament = useCallback(async () => {
    try {
      const data = await fetchActiveTournament();
      setTournament(data);
    } catch (err) {
      console.error("Failed to load tournament:", err);
    }
  }, []);

  useEffect(() => {
    loadTournament();
  }, [loadTournament]);

  // Structural events reload the tournament (and with it every view); the
  // rest go to the views that subscribed via useLiveEvent.
  const handleWsMessage = useCallback((msg) => {
    if (TOURNAMENT_EVENTS.includes(msg.type)) {
      loadTournament();
    }
    liveEvents.emit(msg);
  }, [loadTournament, liveEvents]);

  // Events sent while disconnected are lost, so refetch everything on each
  // (re)connect. On the first connect this repeats the initial load, which
  // also covers a server that wasn't up yet when the page loaded.
  const { isConnected } = useWebSocket(handleWsMessage, loadTournament);

  return (
    <LiveEventsContext.Provider value={liveEvents}>
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        tournament={tournament}
        isConnected={isConnected}
      />

      <main className="flex-1">
        {currentTab === 'monitor' && (
          <HallenMonitor tournament={tournament} />
        )}
        {currentTab === 'scorer' && !isAdmin && (
          <AdminPinPrompt
            tournament={tournament}
            title="Ergebniseingabe"
            description="Ergebnisse trägt die Turnierleitung mit der Admin-PIN ein."
          />
        )}
        {currentTab === 'scorer' && isAdmin && (
          <TableScorer tournament={tournament} />
        )}
        {currentTab === 'standings' && (
          <StandingsTable tournament={tournament} />
        )}
        {currentTab === 'bracket' && (
          <KOBracket 
            tournament={tournament} 
            isAdmin={isAdmin}
            onRoundChange={loadTournament}
          />
        )}
        {currentTab === 'admin' && !isAdmin && (
          <AdminPinPrompt tournament={tournament} />
        )}
        {currentTab === 'admin' && isAdmin && (
          <AdminDashboard 
            tournament={tournament} 
            onTournamentChange={loadTournament}
          />
        )}
        {currentTab === 'print' && (
          <PrintableSheets tournament={tournament} />
        )}
      </main>
    </div>
    </LiveEventsContext.Provider>
  );
}
