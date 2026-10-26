# Shared setup for run.sh and dev.sh. Source it from the repo root.

# Node / NVM path resolution
if [ -d "$HOME/.nvm/versions/node" ]; then
    LATEST_NODE=$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)
    if [ -n "$LATEST_NODE" ]; then
        export PATH="$HOME/.nvm/versions/node/$LATEST_NODE/bin:$PATH"
    fi
fi
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Ensure the venv exists and runs Python 3.15+ (an older venv is rebuilt)
if [ -d "backend/venv" ] && ! backend/venv/bin/python3 -c 'import sys; sys.exit(sys.version_info < (3, 15))' 2>/dev/null; then
    echo "Python-Version im venv ist zu alt, baue es neu..."
    rm -rf backend/venv
fi
if [ ! -d "backend/venv" ]; then
    PYTHON=$(command -v python3.15 || command -v python3)
    if ! "$PYTHON" -c 'import sys; sys.exit(sys.version_info < (3, 15))'; then
        echo "Python 3.15 oder neuer wird benötigt (z.B. brew install python@3.15)." >&2
        exit 1
    fi
    echo "Erstelle Python virtuelles Environment..."
    "$PYTHON" -m venv backend/venv
    backend/venv/bin/pip install -r backend/requirements.txt
fi

# Ensure npm dependencies are installed
if [ ! -d "frontend/node_modules" ]; then
    echo "Installiere Frontend Abhängigkeiten..."
    (cd frontend && npm install)
fi

export PYTHONPATH=.
