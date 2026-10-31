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
    assert [t["table_number"] for t in tables] == [1, 2, 3]


def test_update_tournament_adds_tables(client, t_id):
    res = client.put(f"/api/tournaments/{t_id}", json={"name": "Neu", "table_count": 10})
    assert res.status_code == 200
    assert res.json()["name"] == "Neu"
    assert len(client.get(f"/api/tables/status/{t_id}").json()) == 10
    client.put(f"/api/tournaments/{t_id}", json={"table_count": 4})
    assert len(client.get(f"/api/tables/status/{t_id}").json()) == 4
    assert client.get("/api/tables/status/9999").json() == []

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


def test_monitor_dashboard(client, t_id, add_teams, play):
    assert client.get("/api/monitors/9999/dashboard").status_code == 404

    add_teams(t_id, 2)
    r = client.post(f"/api/tournaments/{t_id}/rounds/next-swiss").json()
    play(r["team_matches"][0]["id"], "AAAB")

    data = client.get(f"/api/monitors/{t_id}/dashboard").json()
    assert (data["current_round"], data["round_type"], data["ko_stage"]) == (1, "swiss", None)
    assert data["ticker"][0]["score"] == "3:1"
    assert data["ko_tree"] == []


def test_monitor_keeps_finished_matches_of_the_round(client, t_id, add_teams, play):
    add_teams(t_id, 5)  # 2 matches + a bye, which the monitor leaves out
    r = client.post(f"/api/tournaments/{t_id}/rounds/next-swiss").json()
    first, second = sorted((m for m in r["team_matches"] if m["team_b_id"]), key=lambda m: m["id"])
    play(first["id"], "AAAB")
    play(second["id"], "A")

    matches = client.get(f"/api/monitors/{t_id}/dashboard").json()["matches"]
    assert [m["match_id"] for m in matches] == [first["id"], second["id"]]
    done, running = matches
    assert (done["is_completed"], done["score_a"], done["score_b"], done["active_game_desc"]) == (True, 3, 1, "")
    assert (running["is_completed"], running["score_a"], running["score_b"]) == (False, 1, 0)
    assert running["active_game_desc"].startswith("Einzel ")


def test_monitor_lists_the_games_of_each_match(client, t_id, add_teams, play):
    add_teams(t_id, 2)
    match = client.post(f"/api/tournaments/{t_id}/rounds/next-swiss").json()["team_matches"][0]
    play(match["id"], "AB")

    running = client.get(f"/api/monitors/{t_id}/dashboard").json()["matches"][0]
    assert running["table_number"] == match["table_number"]
    games = running["games"]
    assert [g["game_order"] for g in games] == [1, 2, 3, 4]
    assert [(g["sets_a"], g["sets_b"], g["is_completed"]) for g in games[:2]] == [(3, 0, True), (0, 3, True)]
    # One table: only the next open game runs
    assert [g["is_running"] for g in games] == [False, False, True, False]
    # Game 3 is the duel of both position-1 players
    assert games[2]["player_a_name"].endswith("A") and games[2]["player_b_name"].endswith("A")

    play(match["id"], "AA")
    done = client.get(f"/api/monitors/{t_id}/dashboard").json()["matches"][0]
    assert not any(g["is_running"] for g in done["games"])


def test_monitor_runs_one_game_per_table_of_a_two_table_match(client, t_id, add_teams, play):
    client.put(f"/api/tournaments/{t_id}", json={"tables_per_match": 2, "table_count": 4})
    add_teams(t_id, 2)
    match = client.post(f"/api/tournaments/{t_id}/rounds/next-swiss").json()["team_matches"][0]
    play(match["id"], "A")

    games = client.get(f"/api/monitors/{t_id}/dashboard").json()["matches"][0]["games"]
    # Game 1 is done; table 1 plays game 3, table 2 still plays game 2
    assert [g["is_running"] for g in games] == [False, True, True, False]


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
