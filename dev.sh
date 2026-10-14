#!/bin/bash
# Development mode: uvicorn with --reload on :8000 plus the Vite dev server
# with HMR on :5173 (proxies /api and /ws to :8000). Not for tournament day —
# saving a file restarts the backend and drops all WebSocket connections.

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "=========================================================="
echo " 🏓 Tischtennis Hobbyturnier Manager – Entwicklermodus"
echo "=========================================================="

source scripts/common.sh

# Cleanup function to kill all background child jobs on exit
cleanup() {
    kill $(jobs -p) 2>/dev/null || true
}
trap cleanup EXIT SIGINT SIGTERM

echo "=========================================================="
echo "🚀 Server bereit:"
echo "👉 Live-Reload (HMR): http://localhost:5173"
echo "👉 Backend:           http://localhost:8000 (zeigt frontend/dist, nur nach npm run build aktuell)"
echo "=========================================================="
echo "Drücke STRG+C zum Beenden."

backend/venv/bin/python3 -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload &
(cd frontend && npm run dev) &

wait
