#!/bin/bash
# Tournament mode: build the frontend once and run a single uvicorn on :8000
# without --reload, so editing files can't restart the server mid-tournament.
# For development with HMR use ./dev.sh.
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "=========================================================="
echo " 🏓 Tischtennis Hobbyturnier Manager – Turniermodus"
echo "=========================================================="

source scripts/common.sh

echo "📦 Baue Frontend..."
(cd frontend && npm run build)

# LAN address for phones, beamer and tablet on the tournament router
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || true)

echo "=========================================================="
echo "🚀 Server bereit:"
echo "👉 Auf diesem Rechner: http://localhost:8000"
if [ -n "$LAN_IP" ]; then
    echo "👉 Im Netzwerk:        http://$LAN_IP:8000"
fi
echo "=========================================================="
echo "Drücke STRG+C zum Beenden."

exec backend/venv/bin/python3 -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
