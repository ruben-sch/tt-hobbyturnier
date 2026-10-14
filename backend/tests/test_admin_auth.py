import pytest
from fastapi.testclient import TestClient

from backend.app.database import Base, engine
from backend.app.main import app

ADMIN = {"X-Admin-Pin": "admin123"}


@pytest.fixture(autouse=True)
def setup_clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def t_id(client):
    return client.get("/api/tournaments/active").json()["id"]


def add_teams(client, t_id, count):
    for i in range(count):
        res = client.post(f"/api/tournaments/{t_id}/teams", headers=ADMIN, json={
            "name": f"Team {i}", "player1_name": f"P{i}A", "player2_name": f"P{i}B"
        })
        assert res.status_code == 200


def test_tournament_response_does_not_leak_admin_pin(client, t_id):
    assert "admin_pin" not in client.get("/api/tournaments/active").json()
    res = client.put(f"/api/tournaments/{t_id}", headers=ADMIN, json={"name": "Neu"})
    assert res.status_code == 200
    assert "admin_pin" not in res.json()


def test_admin_endpoints_reject_missing_and_wrong_pin(client, t_id):
    add_teams(client, t_id, 4)
    round_id = client.post(f"/api/tournaments/{t_id}/rounds/next-swiss", headers=ADMIN).json()["id"]
    team_id = client.get(f"/api/tournaments/{t_id}/teams").json()[0]["id"]

    admin_calls = [
        ("post", "/api/tournaments", {"json": {"name": "Neues Turnier"}}),
        ("put", f"/api/tournaments/{t_id}", {"json": {"name": "X"}}),
        ("post", f"/api/tournaments/{t_id}/teams/csv", {"files": {"file": ("t.csv", b"A;B;C")}}),
        ("post", f"/api/tournaments/{t_id}/teams", {"json": {"name": "T", "player1_name": "a", "player2_name": "b"}}),
        ("delete", f"/api/tournaments/{t_id}/teams/{team_id}", {}),
        ("post", f"/api/tournaments/{t_id}/rounds/next-swiss", {}),
        ("post", f"/api/tournaments/{t_id}/rounds/start-ko", {}),
        ("post", f"/api/tournaments/{t_id}/rounds/advance-ko", {}),
        ("post", f"/api/rounds/{round_id}/swap-pairings", {"json": {"match_id_1": 1, "match_id_2": 2}}),
        ("post", f"/api/rounds/{round_id}/complete", {}),
        ("get", f"/api/tournaments/{t_id}/admin-check", {}),
    ]
    for method, url, kwargs in admin_calls:
        missing = getattr(client, method)(url, **kwargs)
        assert missing.status_code == 401, (method, url)
        wrong = getattr(client, method)(url, headers={"X-Admin-Pin": "falsch"}, **kwargs)
        assert wrong.status_code == 403, (method, url)

    # Nothing changed
    assert len(client.get(f"/api/tournaments/{t_id}/teams").json()) == 4
    assert client.get("/api/tournaments/active").json()["id"] == t_id


def test_result_entry_stays_open(client, t_id):
    add_teams(client, t_id, 2)
    r = client.post(f"/api/tournaments/{t_id}/rounds/next-swiss", headers=ADMIN).json()
    match = r["team_matches"][0]
    game = match["individual_games"][0]

    res = client.post(f"/api/matches/{match['id']}/games/{game['id']}/quick-result", json={
        "sets": [{"set_number": n, "score_a": 11, "score_b": 3} for n in (1, 2, 3)]
    })
    assert res.status_code == 200


def test_admin_check_and_pin_change(client, t_id):
    assert client.get(f"/api/tournaments/{t_id}/admin-check", headers=ADMIN).status_code == 200
    assert client.get("/api/tournaments/999/admin-check", headers=ADMIN).status_code == 404

    res = client.put(f"/api/tournaments/{t_id}", headers=ADMIN, json={"admin_pin": " 4711 "})
    assert res.status_code == 200

    assert client.get(f"/api/tournaments/{t_id}/admin-check", headers=ADMIN).status_code == 403
    assert client.get(f"/api/tournaments/{t_id}/admin-check", headers={"X-Admin-Pin": "4711"}).status_code == 200


def test_admin_pin_cannot_be_blank(client, t_id):
    res = client.put(f"/api/tournaments/{t_id}", headers=ADMIN, json={"admin_pin": "   "})
    assert res.status_code == 400
    assert client.get(f"/api/tournaments/{t_id}/admin-check", headers=ADMIN).status_code == 200
