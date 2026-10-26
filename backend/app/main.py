import os
import random

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.app.database import Base, engine
from backend.app.routers import (
    matches,
    monitors,
    rounds,
    server,
    tables,
    teams,
    tournaments,
)
from backend.app.websocket_hub import ws_manager

# Create tables
Base.metadata.create_all(bind=engine)

# Fixed seed for the round 1 draw, so an e2e run can be replayed
if os.getenv("TT_RANDOM_SEED"):
    random.seed(int(os.environ["TT_RANDOM_SEED"]))

app = FastAPI(
    title="TT-Turnier Live-Manager API",
    description="Backend API für Tischtennis-Turniere nach Schweizer System mit 2er-Teams",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(tournaments.router)
app.include_router(teams.router)
app.include_router(rounds.router)
app.include_router(matches.router)
app.include_router(tables.router)
app.include_router(monitors.router)
app.include_router(server.router)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive, listen for ping or client events
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)


# Mount static files if frontend is built
frontend_dist = os.path.join(os.path.dirname(__file__), "../../frontend/dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")
