import pytest


@pytest.fixture
def match(client, t_id, add_teams):
    add_teams(t_id, 2)
    r = client.post(f"/api/tournaments/{t_id}/rounds/next-swiss").json()
    return r["team_matches"][0]


def first_game(match):
    return next(g for g in match["individual_games"] if g["game_order"] == 1)


def point(client, match, game, set_number, a, b):
    res = client.post(f"/api/matches/{match['id']}/games/{game['id']}/point",
                      json={"set_number": set_number, "point_a": a, "point_b": b})
    assert res.status_code == 200
    return res.json()


def test_point_by_point_scoring(client, match):
    game = first_game(match)

    g = point(client, match, game, 1, 5, 3)
    assert (g["current_point_a"], g["current_point_b"], g["sets_won_a"]) == (5, 3, 0)

    # Deuce: 11:10 does not win the set
    g = point(client, match, game, 1, 11, 10)
    assert g["sets_won_a"] == 0
    assert g["current_set_index"] == 1

    # Two points ahead wins the set and resets the points for the next set
    g = point(client, match, game, 1, 12, 10)
    assert (g["sets_won_a"], g["current_set_index"]) == (1, 2)
    assert (g["current_point_a"], g["current_point_b"]) == (0, 0)
    set1 = next(s for s in g["set_scores"] if s["set_number"] == 1)
    assert (set1["score_a"], set1["score_b"], set1["is_completed"]) == (12, 10, True)

    # Negative input is clamped
    g = point(client, match, game, 2, -3, 4)
    assert (g["current_point_a"], g["current_point_b"]) == (0, 4)

    point(client, match, game, 2, 3, 11)
    point(client, match, game, 3, 11, 2)
    g = point(client, match, game, 4, 11, 8)
    assert g["is_completed"] is True
    assert g["winner_team_side"] == "A"
    assert (g["sets_won_a"], g["sets_won_b"]) == (3, 1)

    m = client.get(f"/api/matches/{match['id']}").json()
    assert (m["score_a"], m["score_b"], m["is_completed"]) == (1, 0, False)


def test_point_and_result_unknown_ids(client, match):
    game = first_game(match)
    body = {"set_number": 1, "point_a": 1, "point_b": 0}
    assert client.post(f"/api/matches/9999/games/{game['id']}/point", json=body).status_code == 404
    assert client.post(f"/api/matches/{match['id']}/games/9999/point", json=body).status_code == 404

    sets = {"sets": [{"set_number": 1, "score_a": 11, "score_b": 3}]}
    assert client.post(f"/api/matches/9999/games/{game['id']}/quick-result", json=sets).status_code == 404
    assert client.post(f"/api/matches/{match['id']}/games/9999/quick-result", json=sets).status_code == 404

    assert client.get("/api/matches/9999").status_code == 404
    lineup = {"team_a_p1_name": "a", "team_a_p2_name": "b", "team_b_p1_name": "c", "team_b_p2_name": "d"}
    assert client.post("/api/matches/9999/lineup", json=lineup).status_code == 404


def test_quick_result_can_be_corrected_to_unfinished(client, match):
    game = first_game(match)
    url = f"/api/matches/{match['id']}/games/{game['id']}/quick-result"

    done = client.post(url, json={"sets": [
        {"set_number": n, "score_a": 11, "score_b": 9} for n in (1, 2, 3)
    ]}).json()
    assert done["is_completed"] is True

    partial = client.post(url, json={"sets": [
        {"set_number": 1, "score_a": 11, "score_b": 9},
        {"set_number": 2, "score_a": 8, "score_b": 11},
    ]}).json()
    assert partial["is_completed"] is False
    assert partial["winner_team_side"] is None
    assert (partial["sets_won_a"], partial["sets_won_b"]) == (1, 1)
    # Old set scores are replaced, not appended
    assert len(partial["set_scores"]) == 2


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
