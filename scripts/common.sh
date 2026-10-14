# Shared setup for run.sh and dev.sh. Source it from the repo root.

# Node / NVM path resolution
if [ -d "$HOME/.nvm/versions/node" ]; then
    LATEST_NODE=$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)
    if [ -n "$LATEST_NODE" ]; then
        export PATH="$HOME/.nvm/versions/node/$LATEST_NODE/bin:$PATH"
    fi
fi
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Ensure venv exists
if [ ! -d "backend/venv" ]; then
    echo "Erstelle Python virtuelles Environment..."
    python3 -m venv backend/venv
    backend/venv/bin/pip install -r backend/requirements.txt
fi

# Ensure npm dependencies are installed
if [ ! -d "frontend/node_modules" ]; then
    echo "Installiere Frontend Abhängigkeiten..."
    (cd frontend && npm install)
fi

export PYTHONPATH=.
