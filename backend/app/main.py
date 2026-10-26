import os
import random
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from mcp.server.auth.middleware.auth_context import AuthContextMiddleware
from mcp.server.auth.middleware.bearer_auth import BearerAuthBackend
from mcp.server.auth.provider import ProviderTokenVerifier
from mcp.server.transport_security import TransportSecuritySettings
from starlette.middleware.authentication import AuthenticationMiddleware
from starlette.routing import Route

from backend.app.database import Base, engine
from backend.app.mcp_auth import PinHeaderAsBearer, login_router, provider
from backend.app.mcp_server import mcp
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

# Stateless JSON: every MCP call is a plain POST to /mcp, nothing to keep per client.
# Host checks are off because the app is reached by LAN IP and by its public domain;
# every /mcp request is authenticated (OAuth token or admin PIN, see mcp_auth).
mcp_app = mcp.streamable_http_app(
    stateless_http=True,
    json_response=True,
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    async with mcp.session_manager.run():
        yield


app = FastAPI(
    title="TT-Turnier Live-Manager API",
    description="Backend API für Tischtennis-Turniere nach Schweizer System mit 2er-Teams",
    version="1.0.0",
    lifespan=lifespan,
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
app.include_router(login_router)


def _with_mcp_auth(route):
    """The MCP app's routes (/mcp, OAuth endpoints, metadata) without its Starlette app around them:
    /mcp gets the bearer authentication that app would have added as middleware."""
    if route.path != "/mcp":
        return route
    backend = BearerAuthBackend(ProviderTokenVerifier(provider))
    return Route("/mcp", endpoint=PinHeaderAsBearer(
        AuthenticationMiddleware(AuthContextMiddleware(route.endpoint), backend=backend)
    ))


app.router.routes.extend(_with_mcp_auth(r) for r in mcp_app.routes)


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
