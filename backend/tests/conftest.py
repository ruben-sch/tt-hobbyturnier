import pytest
from fastapi.testclient import TestClient

from backend.app.database import Base, engine
from backend.app.main import app

# Sent on every request so the tests also pass where admin endpoints check the PIN.
ADMIN = {"X-Admin-Pin": "admin123"}

WIN_A = {"sets_a": 3, "sets_b": 0}
WIN_B = {"sets_a": 0, "sets_b": 3}


@pytest.fixture
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="session")
def mcp_http():
    """Client that runs the app lifespan (MCP session manager), which may only start once per process."""
    with TestClient(app) as http:
        yield http


@pytest.fixture
def client(clean_db):
    return TestClient(app, headers=ADMIN)


@pytest.fixture
def t_id(client):
    return client.get("/api/tournaments/active").json()["id"]


@pytest.fixture
def add_teams(client):
    def _add(t_id, count):
        ids = []
        for i in range(count):
            res = client.post(f"/api/tournaments/{t_id}/teams", json={
                "name": f"Team {i}", "player1_name": f"P{i}A", "player2_name": f"P{i}B"
            })
            assert res.status_code == 200
            ids.append(res.json()["id"])
        return ids
    return _add


@pytest.fixture
def play(client):
    """Enters results for a match from a string like "AABB" (winner side per game, in game order)."""
    def _play(match_id, winners):
        for side in winners:
            match = client.get(f"/api/matches/{match_id}").json()
            game = next(g for g in sorted(match["individual_games"], key=lambda g: g["game_order"])
                        if not g["is_completed"])
            res = client.post(f"/api/matches/{match_id}/games/{game['id']}/result",
                              json=WIN_A if side == "A" else WIN_B)
            assert res.status_code == 200
        return client.get(f"/api/matches/{match_id}").json()
    return _play
