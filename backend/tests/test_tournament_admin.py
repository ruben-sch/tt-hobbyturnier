from fastapi.testclient import TestClient

from backend.app.main import app


def test_create_tournament_replaces_active_one(client, t_id):
    res = client.post("/api/tournaments", json={"name": "Sommerturnier", "table_count": 3})
    assert res.status_code == 200
    new = res.json()
    assert new["id"] != t_id
    assert new["is_active"] is True

    assert client.get("/api/tournaments/active").json()["id"] == new["id"]
    tables = client.get(f"/api/tables/status/{new['id']}").json()
    assert [(t["table_number"], t["pin_code"]) for t in tables] == [(1, "1001"), (2, "1002"), (3, "1003")]


def test_update_tournament_adds_tables(client, t_id):
    res = client.put(f"/api/tournaments/{t_id}", json={"name": "Neu", "table_count": 10})
    assert res.status_code == 200
    assert res.json()["name"] == "Neu"
    assert len(client.get(f"/api/tables/status/{t_id}").json()) == 10

    assert client.put("/api/tournaments/9999", json={"name": "X"}).status_code == 404


def test_csv_import(client, t_id):
    csv = "Mannschaft;Spieler 1;Spieler 2\nAsse;Anna;Ben\nzu kurz;x\n;leer;name\nBlocker;Cem;Dana\n"
    res = client.post(f"/api/tournaments/{t_id}/teams/csv",
                      files={"file": ("teams.csv", csv.encode("utf-8-sig"))})
    assert res.status_code == 200
    assert res.json()["teams"] == ["Asse", "Blocker"]

    # Comma separated files work too
    res = client.post(f"/api/tournaments/{t_id}/teams/csv", files={"file": ("t.csv", b"Topspin,Eva,Finn\n")})
    assert res.json()["teams"] == ["Topspin"]

    teams = client.get(f"/api/tournaments/{t_id}/teams").json()
    assert [t["name"] for t in teams] == ["Asse", "Blocker", "Topspin"]

    res = client.post("/api/tournaments/9999/teams/csv", files={"file": ("t.csv", b"A;B;C")})
    assert res.status_code == 404


def test_csv_export(client, t_id, add_teams):
    add_teams(t_id, 2)
    res = client.get(f"/api/tournaments/{t_id}/export/csv")
    assert res.status_code == 200
    assert f"turnier_ergebnisse_{t_id}.csv" in res.headers["content-disposition"]

    lines = res.content.decode("utf-8-sig").splitlines()
    assert lines[0].startswith("Platz;Mannschaft;Spieler 1;Spieler 2")
    assert len(lines) == 3
    assert "Team 0;P0A;P0B" in "\n".join(lines)


def test_team_create_and_delete(client, t_id, add_teams):
    body = {"name": "T", "player1_name": "a", "player2_name": "b"}
    assert client.post("/api/tournaments/9999/teams", json=body).status_code == 404

    team_id = add_teams(t_id, 2)[0]
    assert client.delete(f"/api/tournaments/{t_id}/teams/{team_id}").status_code == 200
    assert team_id not in [t["id"] for t in client.get(f"/api/tournaments/{t_id}/teams").json()]

    assert client.delete(f"/api/tournaments/{t_id}/teams/9999").status_code == 404


def test_table_status_shows_running_game(client, t_id, add_teams):
    add_teams(t_id, 2)
    match = client.post(f"/api/tournaments/{t_id}/rounds/next-swiss").json()["team_matches"][0]
    game = next(g for g in match["individual_games"] if g["game_order"] == 1)

    tables = client.get(f"/api/tables/status/{t_id}").json()
    busy = next(t for t in tables if t["table_number"] == match["table_number"])
    assert busy["is_active"] is True
    assert busy["current_team_match_id"] == match["id"]
    assert busy["active_game_desc"] == f"Einzel 1: {game['player_a_name']} vs {game['player_b_name']}"
    assert sum(t["is_active"] for t in tables) == 1


def test_pin_authentication(client, t_id, add_teams):
    add_teams(t_id, 2)
    match = client.post(f"/api/tournaments/{t_id}/rounds/next-swiss").json()["team_matches"][0]
    url = f"/api/tables/auth/{t_id}"

    admin = client.post(url, json={"pin": " admin123 "}).json()
    assert (admin["authenticated"], admin["role"]) == (True, "admin")

    table = client.post(url, json={"pin": f"{1000 + match['table_number']}"}).json()
    assert (table["role"], table["match_id"]) == ("table", match["id"])

    free_table = client.post(url, json={"pin": "1008"}).json()
    assert (free_table["role"], free_table["match_id"]) == ("table", None)

    # The random match PIN can collide with a table PIN (1001-1008), which takes precedence
    if not 1001 <= int(match["match_pin"]) <= 1008:
        by_match = client.post(url, json={"pin": match["match_pin"]}).json()
        assert (by_match["role"], by_match["match_id"]) == ("match", match["id"])

    wrong = client.post(url, json={"pin": "0000"}).json()
    assert (wrong["authenticated"], wrong["role"]) == (False, "none")

    assert client.post("/api/tables/auth/9999", json={"pin": "1"}).status_code == 404


def test_monitor_dashboard(client, t_id, add_teams, play):
    assert client.get("/api/monitors/9999/dashboard").status_code == 404

    add_teams(t_id, 2)
    r = client.post(f"/api/tournaments/{t_id}/rounds/next-swiss").json()
    play(r["team_matches"][0]["id"], "AAAB")

    data = client.get(f"/api/monitors/{t_id}/dashboard").json()
    assert (data["current_round"], data["round_type"], data["ko_stage"]) == (1, "swiss", None)
    assert data["ticker"][0]["score"] == "3:1"
    assert data["ko_tree"] == []


def test_default_admin_pin_comes_from_env(clean_db, monkeypatch):
    monkeypatch.setenv("TT_ADMIN_PIN", " geheim42 ")
    client = TestClient(app)
    t_id = client.get("/api/tournaments/active").json()["id"]
    url = f"/api/tournaments/{t_id}/admin-check"
    assert client.get(url, headers={"X-Admin-Pin": "admin123"}).status_code == 403
    assert client.get(url, headers={"X-Admin-Pin": "geheim42"}).status_code == 200

    # A new tournament without an explicit PIN gets the configured one as well
    res = client.post("/api/tournaments", json={"name": "Herbst"}, headers={"X-Admin-Pin": "geheim42"})
    new_url = f"/api/tournaments/{res.json()['id']}/admin-check"
    assert client.get(new_url, headers={"X-Admin-Pin": "geheim42"}).status_code == 200
