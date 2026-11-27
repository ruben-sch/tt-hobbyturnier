def start_round(client, t_id, add_teams, teams=2):
    add_teams(t_id, teams)
    return client.post(f"/api/tournaments/{t_id}/rounds/next-swiss").json()


def test_live_matches_mix_every_running_tournament(client, t_id, add_teams, play):
    hobby = start_round(client, t_id, add_teams)
    jugend_t = client.post("/api/tournaments", json={"name": "Jugend", "best_of_sets": 3}).json()
    jugend = start_round(client, jugend_t["id"], add_teams, teams=5)  # 2 matches and a bye
    closed_t = client.post("/api/tournaments", json={"name": "Alt"}).json()
    start_round(client, closed_t["id"], add_teams)
    client.put(f"/api/tournaments/{closed_t['id']}", json={"is_active": False})

    hobby_match = hobby["team_matches"][0]
    play(hobby_match["id"], "AAAB")

    live = client.get("/api/matches/live").json()
    # Byes and abgeschlossene tournaments are left out; finished matches stay, for corrections
    assert [(m["tournament_name"], m["is_completed"]) for m in live] == [
        ("Tischtennis Hobbyturnier", True), ("Jugend", False), ("Jugend", False),
    ]
    done = live[0]
    assert (done["match_id"], done["score_a"], done["score_b"], done["active_game_desc"]) == (
        hobby_match["id"], 3, 1, "")
    assert (done["best_of_sets"], live[1]["best_of_sets"]) == (5, 3)
    assert live[1]["tournament_id"] == jugend_t["id"]
    assert live[1]["round_number"] == jugend["round_number"] == 1
    assert live[1]["active_game_desc"].startswith("Einzel 1: ")


def test_running_game_is_the_first_open_one(client, t_id, add_teams, play):
    match = start_round(client, t_id, add_teams)["team_matches"][0]
    # A correction can leave a gap: game 2 has a result, game 1 doesn't
    game2 = next(g for g in match["individual_games"] if g["game_order"] == 2)
    client.post(f"/api/matches/{match['id']}/games/{game2['id']}/result", json={"sets_a": 3, "sets_b": 0})

    games = client.get(f"/api/monitors/{t_id}/dashboard").json()["matches"][0]["games"]
    assert [g["is_running"] for g in games] == [True, False, False, False]
    assert "table_number" not in games[0]
