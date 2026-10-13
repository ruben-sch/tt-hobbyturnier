import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './components/Navbar';
import HallenMonitor from './components/HallenMonitor';
import TableScorer from './components/TableScorer';
import StandingsTable from './components/StandingsTable';
import KOBracket from './components/KOBracket';
import AdminDashboard from './components/AdminDashboard';
import PrintableSheets from './components/PrintableSheets';
import { fetchActiveTournament } from './services/api';
import { useWebSocket } from './hooks/useWebSocket';

export default function App() {
  const [currentTab, setCurrentTab] = useState('monitor');
  const [tournament, setTournament] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

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

  // Handle WebSocket messages
  const handleWsMessage = useCallback((msg) => {
    console.log("WebSocket event received:", msg);
    if (msg.type === 'TOURNAMENT_UPDATED' || msg.type === 'KO_STARTED') {
      loadTournament();
    }
    // Increment refreshKey to trigger child component refresh
    setRefreshKey((k) => k + 1);
  }, [loadTournament]);

  const { isConnected } = useWebSocket(handleWsMessage);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        tournament={tournament}
        isConnected={isConnected}
      />

      <main className="flex-1">
        {currentTab === 'monitor' && (
          <HallenMonitor 
            tournament={tournament} 
            key={`monitor-${refreshKey}`} 
          />
        )}
        {currentTab === 'scorer' && (
          <TableScorer 
            tournament={tournament} 
            onScoreChange={() => setRefreshKey(k => k + 1)} 
          />
        )}
        {currentTab === 'standings' && (
          <StandingsTable 
            tournament={tournament} 
            key={`standings-${refreshKey}`} 
          />
        )}
        {currentTab === 'bracket' && (
          <KOBracket 
            tournament={tournament} 
            onRoundChange={() => { loadTournament(); setRefreshKey(k => k + 1); }} 
            key={`bracket-${refreshKey}`} 
          />
        )}
        {currentTab === 'admin' && (
          <AdminDashboard 
            tournament={tournament} 
            onTournamentChange={() => { loadTournament(); setRefreshKey(k => k + 1); }} 
            key={`admin-${refreshKey}`} 
          />
        )}
        {currentTab === 'print' && (
          <PrintableSheets 
            tournament={tournament} 
            key={`print-${refreshKey}`} 
          />
        )}
      </main>
    </div>
  );
}
