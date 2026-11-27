import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Navbar from './components/Navbar';
import HallenMonitor from './components/HallenMonitor';
import TableScorer from './components/TableScorer';
import StandingsTable from './components/StandingsTable';
import KOBracket from './components/KOBracket';
import RoundHistory from './components/RoundHistory';
import AdminDashboard from './components/AdminDashboard';
import PrintableSheets from './components/PrintableSheets';
import AdminPinPrompt from './components/AdminPinPrompt';
import TournamentOverview from './components/TournamentOverview';
import { fetchTournaments, getAdminPin, subscribeAdminPin, verifyAdminPin, setAdminPin } from './services/api';
import { useWebSocket } from './hooks/useWebSocket';
import { LiveEventsContext, TOURNAMENT_EVENTS, createLiveEvents } from './hooks/useLiveEvents';

const TABS = ['start', 'monitor', 'scorer', 'standings', 'history', 'bracket', 'admin', 'print'];

// Tab and tournament live in the URL (?tab=…&turnier=…), so a reload or a link
// keeps them. The monitor QR code links to ?tab=start (see useAppBaseUrl).
function readUrl() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  return {
    tab: TABS.includes(tab) ? tab : 'monitor',
    tournamentId: Number(params.get('turnier')) || null,
  };
}

function writeUrl(tab, tournamentId) {
  const params = new URLSearchParams(window.location.search);
  params.set('tab', tab);
  if (tournamentId) params.set('turnier', String(tournamentId));
  else params.delete('turnier');
  window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
}

export default function App() {
  const [currentTab, setCurrentTab] = useState(() => readUrl().tab);
  // The tournament picked in the navigation; null: the default one, and on the
  // monitor every running tournament in turn.
  const [selectedId, setSelectedId] = useState(() => readUrl().tournamentId);
  const [tournaments, setTournaments] = useState(null);
  const liveEvents = useMemo(() => createLiveEvents(), []);
  const [isAdmin, setIsAdmin] = useState(() => Boolean(getAdminPin()));

  useEffect(() => subscribeAdminPin((pin) => setIsAdmin(Boolean(pin))), []);

  // A PIN remembered from earlier in this tab may be outdated (TT_ADMIN_PIN
  // changed on the server): check it once.
  useEffect(() => {
    const pin = getAdminPin();
    if (!pin) return;
    verifyAdminPin(pin)
      .then((ok) => { if (!ok) setAdminPin(null); })
      .catch(() => {});
  }, []);

  useEffect(() => { writeUrl(currentTab, selectedId); }, [currentTab, selectedId]);

  const loadTournaments = useCallback(async () => {
    try {
      setTournaments(await fetchTournaments());
    } catch (err) {
      console.error("Failed to load tournaments:", err);
    }
  }, []);

  useEffect(() => {
    loadTournaments();
  }, [loadTournaments]);

  // Structural events reload the tournaments (and with them every view); the
  // rest go to the views that subscribed via useLiveEvent.
  const handleWsMessage = useCallback((msg) => {
    if (TOURNAMENT_EVENTS.includes(msg.type)) {
      loadTournaments();
    }
    liveEvents.emit(msg);
  }, [loadTournaments, liveEvents]);

  // Events sent while disconnected are lost, so refetch everything on each
  // (re)connect. On the first connect this repeats the initial load, which
  // also covers a server that wasn't up yet when the page loaded.
  const { isConnected } = useWebSocket(handleWsMessage, loadTournaments);

  const running = useMemo(() => (tournaments || []).filter((t) => t.is_active), [tournaments]);
  const selected = tournaments?.find((t) => t.id === selectedId) || null;
  // Newest running tournament, or the newest one if all are abgeschlossen.
  const tournament = selected || running[0] || tournaments?.[0] || null;
  const monitorTournaments = useMemo(() => {
    if (selected) return [selected];
    return running.length ? running : (tournament ? [tournament] : []);
  }, [selected, running, tournament]);

  const openTournament = useCallback((id, tab) => {
    setSelectedId(id);
    if (tab) setCurrentTab(tab);
  }, []);

  return (
    <LiveEventsContext.Provider value={liveEvents}>
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        tournament={tournament}
        tournaments={tournaments || []}
        selectedId={selected ? selected.id : null}
        onSelectTournament={setSelectedId}
        isConnected={isConnected}
      />

      <main className="flex-1">
        {currentTab === 'start' && (
          <TournamentOverview
            tournaments={tournaments}
            isAdmin={isAdmin}
            onOpen={openTournament}
          />
        )}
        {currentTab === 'monitor' && (
          <HallenMonitor tournaments={monitorTournaments} />
        )}
        {currentTab === 'scorer' && !isAdmin && (
          <AdminPinPrompt
            title="Ergebniseingabe"
            description="Ergebnisse trägt die Turnierleitung mit der Admin-PIN ein."
          />
        )}
        {currentTab === 'scorer' && isAdmin && (
          <TableScorer tournaments={running} />
        )}
        {currentTab === 'standings' && (
          <StandingsTable tournament={tournament} />
        )}
        {currentTab === 'history' && (
          <RoundHistory tournament={tournament} />
        )}
        {currentTab === 'bracket' && (
          <KOBracket
            tournament={tournament}
            isAdmin={isAdmin}
            onRoundChange={loadTournaments}
          />
        )}
        {currentTab === 'admin' && !isAdmin && (
          <AdminPinPrompt />
        )}
        {currentTab === 'admin' && isAdmin && (
          <AdminDashboard
            tournament={tournament}
            onTournamentChange={loadTournaments}
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
