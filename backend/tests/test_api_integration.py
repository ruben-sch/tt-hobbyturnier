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

    # 4. Confirm lineup for match 1
    lineup_res = client.post(f"/api/matches/{match1['id']}/lineup", json={
        "team_a_p1_name": match1["team_a"]["player1_name"],
        "team_a_p2_name": match1["team_a"]["player2_name"],
        "team_b_p1_name": match1["team_b"]["player1_name"],
        "team_b_p2_name": match1["team_b"]["player2_name"]
    })
    assert lineup_res.status_code == 200
    assert lineup_res.json()["lineup_confirmed"] == True

    # 5. Enter quick scores for match 1 (all 4 games won by Team A: 4:0)
    m1_updated = client.get(f"/api/matches/{match1['id']}").json()
    for g in m1_updated["individual_games"]:
        g_res = client.post(f"/api/matches/{match1['id']}/games/{g['id']}/quick-result", json={
            "sets": [
                {"set_number": 1, "score_a": 11, "score_b": 7},
                {"set_number": 2, "score_a": 11, "score_b": 5},
                {"set_number": 3, "score_a": 11, "score_b": 8}
            ]
        })
        assert g_res.status_code == 200
        assert g_res.json()["is_completed"] == True

    # Check match 1 is completed with 4:0
    m1_final = client.get(f"/api/matches/{match1['id']}").json()
    assert m1_final["score_a"] == 4
    assert m1_final["score_b"] == 0
    assert m1_final["is_completed"] == True

    # 6. Enter quick scores for match 2 (won 3:1)
    m2_updated = client.get(f"/api/matches/{match2['id']}").json()
    for idx, g in enumerate(m2_updated["individual_games"]):
        score_a = 11 if idx < 3 else 5
        score_b = 6 if idx < 3 else 11
        client.post(f"/api/matches/{match2['id']}/games/{g['id']}/quick-result", json={
            "sets": [
                {"set_number": 1, "score_a": score_a, "score_b": score_b},
                {"set_number": 2, "score_a": score_a, "score_b": score_b},
                {"set_number": 3, "score_a": score_a, "score_b": score_b}
            ]
        })

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

    # 11. Test Table PIN Auth
    table1 = mon_data["tables"][0]
    pin_auth_res = client.post(f"/api/tables/auth/{t_id}", json={
        "pin": table1["pin_code"]
    })
    assert pin_auth_res.status_code == 200
    auth_data = pin_auth_res.json()
    assert auth_data["authenticated"] == True
    assert auth_data["role"] == "table"
