#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "=========================================================="
echo " 🏓 Tischtennis Hobbyturnier Manager wird gestartet..."
echo "=========================================================="

# Ensure venv exists
if [ ! -d "backend/venv" ]; then
    echo "Erstelle Python virtuelles Environment..."
    python3 -m venv backend/venv
    backend/venv/bin/pip install -r backend/requirements.txt
fi

# Ensure frontend is built
if [ ! -d "frontend/dist" ]; then
    echo "Erstelle Frontend Build..."
    export PATH="/Users/ruben/.nvm/versions/node/v26.10.0/bin:$PATH"
    cd frontend
    npm install
    npm run build
    cd ..
fi

echo "Starte Server auf http://0.0.0.0:8000"
echo "Öffne im Browser: http://localhost:8000"
echo "Drücke STRG+C zum Beenden."

export PYTHONPATH=.
backend/venv/bin/python3 -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
