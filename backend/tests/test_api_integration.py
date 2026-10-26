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


def test_full_tournament_lifecycle():
    client = TestClient(app)

    # 1. Get or create active tournament
    res = client.get("/api/tournaments/active")
    assert res.status_code == 200
    t_data = res.json()
    t_id = t_data["id"]
    assert t_id > 0

    # 2. Add 4 teams
    for i in range(1, 5):
        team_res = client.post(f"/api/tournaments/{t_id}/teams", headers=ADMIN, json={
            "name": f"Team {i}",
            "player1_name": f"Spieler {i}A",
            "player2_name": f"Spieler {i}B"
        })
        assert team_res.status_code == 200

    # Verify teams list
    teams_res = client.get(f"/api/tournaments/{t_id}/teams")
    assert len(teams_res.json()) == 4

    # 3. Generate Round 1 (Swiss)
    r1_res = client.post(f"/api/tournaments/{t_id}/rounds/next-swiss", headers=ADMIN)
    assert r1_res.status_code == 200
    r1 = r1_res.json()
    assert r1["round_number"] == 1
    assert len(r1["team_matches"]) == 2

    match1 = r1["team_matches"][0]
    match2 = r1["team_matches"][1]

    # 5. Enter results for match 1 (all 4 games won by Team A: 4:0)
    m1_updated = client.get(f"/api/matches/{match1['id']}").json()
    for g in m1_updated["individual_games"]:
        g_res = client.post(f"/api/matches/{match1['id']}/games/{g['id']}/result", headers=ADMIN,
                            json={"sets_a": 3, "sets_b": 0})
        assert g_res.status_code == 200
        assert g_res.json()["is_completed"] == True

    # Check match 1 is completed with 4:0
    m1_final = client.get(f"/api/matches/{match1['id']}").json()
    assert m1_final["score_a"] == 4
    assert m1_final["score_b"] == 0
    assert m1_final["is_completed"] == True

    # 6. Enter results for match 2 (won 3:1)
    m2_updated = client.get(f"/api/matches/{match2['id']}").json()
    for idx, g in enumerate(m2_updated["individual_games"]):
        sets = {"sets_a": 3, "sets_b": 1} if idx < 3 else {"sets_a": 1, "sets_b": 3}
        client.post(f"/api/matches/{match2['id']}/games/{g['id']}/result", headers=ADMIN, json=sets)

    m2_final = client.get(f"/api/matches/{match2['id']}").json()
    assert m2_final["is_completed"] == True
    assert m2_final["score_a"] == 3
    assert m2_final["score_b"] == 1

    # 7. Check Standings
    standings_res = client.get(f"/api/tournaments/{t_id}/standings")
    assert standings_res.status_code == 200
    standings = standings_res.json()
    assert len(standings) == 4
    assert standings[0]["game_points"] == 4
    assert standings[1]["game_points"] == 3

    # 8. Complete Round 1
    comp_res = client.post(f"/api/rounds/{r1['id']}/complete", headers=ADMIN)
    assert comp_res.status_code == 200

    # 9. Generate Round 2 (Swiss pairings with rematch check)
    r2_res = client.post(f"/api/tournaments/{t_id}/rounds/next-swiss", headers=ADMIN)
    assert r2_res.status_code == 200
    r2 = r2_res.json()
    assert r2["round_number"] == 2

    # 10. Check Monitor Dashboard endpoint
    mon_res = client.get(f"/api/monitors/{t_id}/dashboard")
    assert mon_res.status_code == 200
    mon_data = mon_res.json()
    assert "tables" in mon_data
    assert "standings" in mon_data
    assert "ticker" in mon_data
    assert len(mon_data["ticker"]) == 2  # The 2 completed matches from round 1!

    # 11. No table or match PINs anymore: result entry needs the admin PIN
    assert "pin_code" not in mon_data["tables"][0]


def test_monitor_shows_match_score_of_running_match():
    client = TestClient(app)
    t_id = client.get("/api/tournaments/active").json()["id"]
    for i in range(1, 3):
        client.post(f"/api/tournaments/{t_id}/teams", headers=ADMIN, json={
            "name": f"Team {i}", "player1_name": f"Spieler {i}A", "player2_name": f"Spieler {i}B"
        })
    match = client.post(f"/api/tournaments/{t_id}/rounds/next-swiss", headers=ADMIN).json()["team_matches"][0]
    games = sorted(client.get(f"/api/matches/{match['id']}").json()["individual_games"], key=lambda g: g["game_order"])

    # Team A wins Einzel 1
    client.post(f"/api/matches/{match['id']}/games/{games[0]['id']}/result", headers=ADMIN,
                json={"sets_a": 3, "sets_b": 0})

    tables = client.get(f"/api/monitors/{t_id}/dashboard").json()["tables"]
    table = next(t for t in tables if t["current_team_match_id"] == match["id"])
    assert (table["match_score_a"], table["match_score_b"]) == (1, 0)
