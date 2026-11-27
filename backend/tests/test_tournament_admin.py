def test_update_tournament(client, t_id):
    res = client.put(f"/api/tournaments/{t_id}", json={"name": "Neu", "best_of_sets": 3})
    assert res.status_code == 200
    assert (res.json()["name"], res.json()["best_of_sets"]) == ("Neu", 3)
    assert client.put("/api/tournaments/9999", json={"name": "X"}).status_code == 404
    assert client.get("/api/tournaments/9999").status_code == 404


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
    assert "table_number" not in running
    games = running["games"]
    assert [g["game_order"] for g in games] == [1, 2, 3, 4]
    assert [(g["sets_a"], g["sets_b"], g["is_completed"]) for g in games[:2]] == [(3, 0, True), (0, 3, True)]
    # Games run in order: only the next open game runs
    assert [g["is_running"] for g in games] == [False, False, True, False]
    # Game 3 is the duel of both position-1 players
    assert games[2]["player_a_name"].endswith("A") and games[2]["player_b_name"].endswith("A")

    play(match["id"], "AA")
    done = client.get(f"/api/monitors/{t_id}/dashboard").json()["matches"][0]
    assert not any(g["is_running"] for g in done["games"])
