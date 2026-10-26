def next_swiss(client, t_id):
    return client.post(f"/api/tournaments/{t_id}/rounds/next-swiss")


def test_next_swiss_round_preconditions(client, t_id, add_teams):
    assert next_swiss(client, 9999).status_code == 404

    add_teams(t_id, 1)
    res = next_swiss(client, t_id)
    assert res.status_code == 400
    assert "mindestens 2" in res.json()["detail"]

    add_teams(t_id, 1)
    assert next_swiss(client, t_id).status_code == 200
    res = next_swiss(client, t_id)
    assert res.status_code == 400
    assert "noch aktiv" in res.json()["detail"]


def test_odd_team_count_gets_a_bye(client, t_id, add_teams):
    add_teams(t_id, 3)
    r = next_swiss(client, t_id).json()

    bye = next(m for m in r["team_matches"] if m["team_b_id"] is None)
    assert bye["is_completed"] is True
    assert (bye["score_a"], bye["score_b"]) == (4, 0)
    assert bye["winner_team_id"] == bye["team_a_id"]
    assert bye["table_number"] is None
    assert bye["individual_games"] == []

    standings = client.get(f"/api/tournaments/{t_id}/standings").json()
    bye_row = next(s for s in standings if s["team_id"] == bye["team_a_id"])
    assert (bye_row["won_matches"], bye_row["game_points"]) == (1, 4)


def test_two_tables_per_match(client, t_id, add_teams):
    client.put(f"/api/tournaments/{t_id}", json={"tables_per_match": 2})
    add_teams(t_id, 4)
    r = next_swiss(client, t_id).json()

    tables = sorted((m["table_number"], m["table_number_b"]) for m in r["team_matches"])
    assert tables == [(1, 2), (3, 4)]
    games = {g["game_order"]: g["table_number"] for g in r["team_matches"][0]["individual_games"]}
    m0 = r["team_matches"][0]
    assert games == {1: m0["table_number"], 2: m0["table_number_b"], 3: m0["table_number"], 4: m0["table_number_b"]}


def test_swap_pairings(client, t_id, add_teams):
    add_teams(t_id, 4)
    r = next_swiss(client, t_id).json()
    m1, m2 = r["team_matches"]
    url = f"/api/rounds/{r['id']}/swap-pairings"

    res = client.post(url, json={"match_id_1": m1["id"], "match_id_2": m2["id"]})
    assert res.status_code == 200

    new1 = client.get(f"/api/matches/{m1['id']}").json()
    new2 = client.get(f"/api/matches/{m2['id']}").json()
    assert (new1["team_b_id"], new2["team_b_id"]) == (m2["team_b_id"], m1["team_b_id"])
    assert new1["team_b_p1_name"] == m2["team_b"]["player1_name"]
    # Games are rebuilt with the new opponent's players
    game1 = next(g for g in new1["individual_games"] if g["game_order"] == 1)
    assert game1["player_b_name"] == m2["team_b"]["player2_name"]
    assert len(new1["individual_games"]) == 4

    assert client.post(url, json={"match_id_1": m1["id"], "match_id_2": 9999}).status_code == 404

    # Once a game has a result the pairing is fixed
    game = client.get(f"/api/matches/{m1['id']}").json()["individual_games"][0]
    client.post(f"/api/matches/{m1['id']}/games/{game['id']}/result", json={"sets_a": 3, "sets_b": 1})
    res = client.post(url, json={"match_id_1": m1["id"], "match_id_2": m2["id"]})
    assert res.status_code == 400
    assert res.json()["detail"] == "Begegnung bereits begonnen; Tausch nicht mehr möglich."


def test_complete_round(client, t_id, add_teams, play):
    add_teams(t_id, 2)
    r = next_swiss(client, t_id).json()
    url = f"/api/rounds/{r['id']}/complete"

    res = client.post(url)
    assert res.status_code == 400
    assert "1 Spiele nicht abgeschlossen" in res.json()["detail"]

    play(r["team_matches"][0]["id"], "AAAA")
    assert client.post(url).status_code == 200

    rounds = client.get(f"/api/tournaments/{t_id}/rounds").json()
    assert (rounds[0]["is_completed"], rounds[0]["is_active"]) == (True, False)

    assert client.post("/api/rounds/9999/complete").status_code == 404
