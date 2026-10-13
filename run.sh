#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

# Node / NVM path resolution
if [ -d "$HOME/.nvm/versions/node" ]; then
    LATEST_NODE=$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)
    if [ -n "$LATEST_NODE" ]; then
        export PATH="$HOME/.nvm/versions/node/$LATEST_NODE/bin:$PATH"
    fi
fi
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

echo "=========================================================="
echo " 🏓 Tischtennis Hobbyturnier Manager wird gestartet..."
echo "=========================================================="

# Ensure venv exists
if [ ! -d "backend/venv" ]; then
    echo "Erstelle Python virtuelles Environment..."
    python3 -m venv backend/venv
    backend/venv/bin/pip install -r backend/requirements.txt
fi

# Ensure npm dependencies are installed
if [ ! -d "frontend/node_modules" ]; then
    echo "Installiere Frontend Abhängigkeiten..."
    cd frontend && npm install && cd ..
fi

# Always build frontend dist so standalone / port 8000 is always fresh
echo "📦 Baue aktuelles Frontend (dist)..."
cd frontend && npm run build && cd ..

# Cleanup function to kill all background child jobs on exit
cleanup() {
    kill $(jobs -p) 2>/dev/null || true
}
trap cleanup EXIT SIGINT SIGTERM

echo "=========================================================="
echo "🚀 Server bereit:"
echo "👉 Live-Reload / Entwickler-Modus (HMR): http://localhost:5173"
echo "👉 Standard / Produktion:               http://localhost:8000"
echo "=========================================================="
echo "Drücke STRG+C zum Beenden."

export PYTHONPATH=.
backend/venv/bin/python3 -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload &
cd frontend && npm run dev &

wait
