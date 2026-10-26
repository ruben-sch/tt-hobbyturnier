def start_ko(client, t_id, team_count):
    seeds = [s["team_id"] for s in client.get(f"/api/tournaments/{t_id}/standings").json()]
    res = client.post(f"/api/tournaments/{t_id}/rounds/start-ko", params={"team_count": team_count})
    assert res.status_code == 200
    return seeds, res.json()


def by_slot(round_data):
    return sorted(round_data["team_matches"], key=lambda m: m["ko_slot"])


def test_semifinal_to_final_with_deciding_doubles(client, t_id, add_teams, play):
    add_teams(t_id, 4)
    seeds, semis = start_ko(client, t_id, 4)

    assert semis["round_type"] == "ko"
    assert semis["ko_stage"] == "Halbfinale"
    sf1, sf2 = by_slot(semis)
    assert (sf1["team_a_id"], sf1["team_b_id"]) == (seeds[0], seeds[3])
    assert (sf2["team_a_id"], sf2["team_b_id"]) == (seeds[1], seeds[2])

    # Next stage only after all matches are finished
    res = client.post(f"/api/tournaments/{t_id}/rounds/advance-ko")
    assert res.status_code == 400

    # First to 3 wins ends the match, the 4th single is not needed
    sf1_done = play(sf1["id"], "AAA")
    assert sf1_done["is_completed"] is True
    assert (sf1_done["score_a"], sf1_done["score_b"]) == (3, 0)
    assert sf1_done["winner_team_id"] == seeds[0]

    # 2:2 adds the deciding doubles as 5th game
    sf2_tied = play(sf2["id"], "ABAB")
    assert sf2_tied["is_completed"] is False
    assert len(sf2_tied["individual_games"]) == 5
    doubles = next(g for g in sf2_tied["individual_games"] if g["game_order"] == 5)
    assert doubles["is_doubles"] is True

    sf2_done = play(sf2["id"], "B")
    assert sf2_done["is_completed"] is True

    assert (sf2_done["score_a"], sf2_done["score_b"]) == (2, 3)
    assert sf2_done["winner_team_id"] == seeds[2]

    res = client.post(f"/api/tournaments/{t_id}/rounds/advance-ko")
    assert res.status_code == 200
    final = res.json()
    assert final["ko_stage"] == "Finale"
    assert final["round_number"] == semis["round_number"] + 1
    assert len(final["team_matches"]) == 1
    assert (final["team_matches"][0]["team_a_id"], final["team_matches"][0]["team_b_id"]) == (seeds[0], seeds[2])

    ko_tree = client.get(f"/api/monitors/{t_id}/dashboard").json()["ko_tree"]
    assert [stage["stage"] for stage in ko_tree] == ["Halbfinale", "Finale"]
    assert ko_tree[0]["matches"][0]["winner_team_id"] == seeds[0]


def test_quarterfinal_seeding_and_semifinal_pairings(client, t_id, add_teams, play):
    add_teams(t_id, 8)
    seeds, quarters = start_ko(client, t_id, 8)

    assert quarters["ko_stage"] == "Viertelfinale"
    pairs = [(m["team_a_id"], m["team_b_id"]) for m in by_slot(quarters)]
    assert pairs == [(seeds[0], seeds[7]), (seeds[3], seeds[4]), (seeds[1], seeds[6]), (seeds[2], seeds[5])]

    for m in by_slot(quarters):
        play(m["id"], "AAA")

    semis = client.post(f"/api/tournaments/{t_id}/rounds/advance-ko").json()
    assert semis["ko_stage"] == "Halbfinale"
    pairs = [(m["team_a_id"], m["team_b_id"]) for m in by_slot(semis)]
    assert pairs == [(seeds[0], seeds[3]), (seeds[1], seeds[2])]


def test_ko_needs_enough_teams(client, t_id, add_teams):
    add_teams(t_id, 3)
    res = client.post(f"/api/tournaments/{t_id}/rounds/start-ko", params={"team_count": 4})
    assert res.status_code == 400
    assert "Nicht genügend Teams" in res.json()["detail"]


def test_advance_without_ko_round(client, t_id):
    res = client.post(f"/api/tournaments/{t_id}/rounds/advance-ko")
    assert res.status_code == 400
    assert "Keine vorherige KO-Runde" in res.json()["detail"]


def test_correcting_a_single_away_from_2_2_drops_the_deciding_doubles(client, t_id, add_teams, play):
    add_teams(t_id, 4)
    _, semis = start_ko(client, t_id, 4)
    sf = by_slot(semis)[0]

    tied = play(sf["id"], "ABAB")
    assert len(tied["individual_games"]) == 5
    play(sf["id"], "B")

    # Game 2 was actually won by A: 3:1 after the singles, doubles no longer counts
    game2 = next(g for g in tied["individual_games"] if g["game_order"] == 2)
    res = client.post(f"/api/matches/{sf['id']}/games/{game2['id']}/result", json={"sets_a": 3, "sets_b": 2})
    assert res.status_code == 200

    m = client.get(f"/api/matches/{sf['id']}").json()
    assert len(m["individual_games"]) == 4
    assert (m["score_a"], m["score_b"], m["is_completed"]) == (3, 1, True)
    assert m["winner_team_id"] == sf["team_a_id"]


def test_advancing_closes_the_finished_ko_round(client, t_id, add_teams, play):
    add_teams(t_id, 4)
    _, semis = start_ko(client, t_id, 4)
    for m in by_slot(semis):
        play(m["id"], "AAA")

    final = client.post(f"/api/tournaments/{t_id}/rounds/advance-ko").json()

    rounds = {r["id"]: r for r in client.get(f"/api/tournaments/{t_id}/rounds").json()}
    assert (rounds[semis["id"]]["is_completed"], rounds[semis["id"]]["is_active"]) == (True, False)
    assert (rounds[final["id"]]["is_completed"], rounds[final["id"]]["is_active"]) == (False, True)

    data = client.get(f"/api/monitors/{t_id}/dashboard").json()
    assert (data["current_round"], data["ko_stage"]) == (final["round_number"], "Finale")


def test_ko_tables_wrap_around_the_table_count(client, t_id, add_teams, play):
    client.put(f"/api/tournaments/{t_id}", json={"table_count": 2, "tables_per_match": 2})
    add_teams(t_id, 8)
    _, quarters = start_ko(client, t_id, 8)
    for m in by_slot(quarters):
        play(m["id"], "AAA")

    semis = client.post(f"/api/tournaments/{t_id}/rounds/advance-ko").json()

    for r in (quarters, semis):
        assert all((m["table_number"], m["table_number_b"]) == (1, 2) for m in r["team_matches"])


def test_deciding_doubles_uses_the_confirmed_lineup(client, t_id, add_teams, play):
    add_teams(t_id, 4)
    _, semis = start_ko(client, t_id, 4)
    sf = by_slot(semis)[0]
    client.post(f"/api/matches/{sf['id']}/lineup", json={
        "team_a_p1_name": "Ersatz", "team_a_p2_name": "P0A", "team_b_p1_name": "P3B", "team_b_p2_name": "P3A",
    })

    tied = play(sf["id"], "ABAB")

    doubles = next(g for g in tied["individual_games"] if g["is_doubles"])
    assert (doubles["player_a_name"], doubles["player_b_name"]) == ("Ersatz / P0A", "P3B / P3A")
