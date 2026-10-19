import pytest


@pytest.fixture
def match(client, t_id, add_teams):
    add_teams(t_id, 2)
    r = client.post(f"/api/tournaments/{t_id}/rounds/next-swiss").json()
    return r["team_matches"][0]


def first_game(match):
    return next(g for g in match["individual_games"] if g["game_order"] == 1)


def result(client, match, game, a, b):
    return client.post(f"/api/matches/{match['id']}/games/{game['id']}/result", json={"sets_a": a, "sets_b": b})


def test_result_records_the_set_count(client, match):
    game = first_game(match)

    res = result(client, match, game, 3, 1)
    assert res.status_code == 200
    g = res.json()
    assert (g["sets_won_a"], g["sets_won_b"], g["is_completed"], g["winner_team_side"]) == (3, 1, True, "A")

    g = result(client, match, game, 2, 3).json()
    assert (g["sets_won_a"], g["sets_won_b"], g["winner_team_side"]) == (2, 3, "B")

    m = client.get(f"/api/matches/{match['id']}").json()
    assert (m["score_a"], m["score_b"], m["is_completed"]) == (0, 1, False)


@pytest.mark.parametrize("a,b", [(3, 3), (4, 0), (2, 1), (1, 0), (-1, 3), (3, -1)])
def test_result_rejects_impossible_counts_in_best_of_5(client, match, a, b):
    res = result(client, match, first_game(match), a, b)
    assert res.status_code == 400
    assert "3 Gewinnsätze" in res.json()["detail"]


def test_result_follows_best_of_3(client, t_id, match):
    client.put(f"/api/tournaments/{t_id}", json={"best_of_sets": 3})
    game = first_game(match)
    assert result(client, match, game, 2, 1).status_code == 200
    assert result(client, match, game, 3, 0).status_code == 400


def test_result_unknown_ids(client, match):
    game = first_game(match)
    body = {"sets_a": 3, "sets_b": 0}
    assert client.post(f"/api/matches/9999/games/{game['id']}/result", json=body).status_code == 404
    assert client.post(f"/api/matches/{match['id']}/games/9999/result", json=body).status_code == 404

    assert client.get("/api/matches/9999").status_code == 404
    lineup = {"team_a_p1_name": "a", "team_a_p2_name": "b", "team_b_p1_name": "c", "team_b_p2_name": "d"}
    assert client.post("/api/matches/9999/lineup", json=lineup).status_code == 404


def test_zero_zero_resets_a_game_and_reopens_the_match(client, match, play):
    done = play(match["id"], "AAAB")
    assert done["is_completed"] is True

    game = first_game(done)
    g = result(client, match, game, 0, 0).json()
    assert (g["sets_won_a"], g["sets_won_b"], g["is_completed"], g["winner_team_side"]) == (0, 0, False, None)

    m = client.get(f"/api/matches/{match['id']}").json()
    assert (m["score_a"], m["score_b"], m["is_completed"], m["winner_team_id"]) == (2, 1, False, None)


def test_lineup_sets_player_names_per_game(client, match):
    res = client.post(f"/api/matches/{match['id']}/lineup", json={
        "team_a_p1_name": "Anna", "team_a_p2_name": "Ben",
        "team_b_p1_name": "Cem", "team_b_p2_name": "Dana",
    })
    assert res.status_code == 200
    names = {g["game_order"]: (g["player_a_name"], g["player_b_name"]) for g in res.json()["individual_games"]}
    assert names == {
        1: ("Anna", "Dana"),
        2: ("Ben", "Cem"),
        3: ("Anna", "Cem"),
        4: ("Ben", "Dana"),
    }


def test_swiss_match_can_end_in_a_draw(client, t_id, match, play):
    m = play(match["id"], "ABAB")
    assert m["is_completed"] is True
    assert (m["score_a"], m["score_b"]) == (2, 2)
    assert m["winner_team_id"] is None
    # No deciding doubles in Swiss rounds
    assert len(m["individual_games"]) == 4

    standings = client.get(f"/api/tournaments/{t_id}/standings").json()
    assert [s["drawn_matches"] for s in standings] == [1, 1]
    assert [s["game_points"] for s in standings] == [2, 2]
    assert all(s["sets_won"] == 6 and s["sets_lost"] == 6 for s in standings)
