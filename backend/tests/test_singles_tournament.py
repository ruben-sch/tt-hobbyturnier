"""Einzelturnier: a "team" is one player, a match is one game whose set count is the match score."""
import io
from types import SimpleNamespace

import pytest

from backend.app import match_rules


def singles_tournament(client, best_of_sets=5):
    res = client.post("/api/tournaments", json={"name": "Einzel", "is_singles": True, "best_of_sets": best_of_sets})
    assert res.status_code == 200
    assert res.json()["is_singles"] is True
    return res.json()["id"]


def add_players(client, t_id, count):
    ids = []
    for i in range(count):
        res = client.post(f"/api/tournaments/{t_id}/teams", json={"name": f"Spieler {i}"})
        assert res.status_code == 200
        ids.append(res.json()["id"])
    return ids


def enter(client, match, sets_a, sets_b):
    [game] = match["individual_games"]
    res = client.post(f"/api/matches/{match['id']}/games/{game['id']}/result",
                      json={"sets_a": sets_a, "sets_b": sets_b})
    assert res.status_code == 200, res.text
    return client.get(f"/api/matches/{match['id']}").json()


def test_player_needs_only_a_name(client):
    t_id = singles_tournament(client)
    player = client.post(f"/api/tournaments/{t_id}/teams", json={"name": "  Anna Muster "}).json()
    assert (player["name"], player["player1_name"], player["player2_name"]) == ("Anna Muster", "Anna Muster", "")
    assert client.post(f"/api/tournaments/{t_id}/teams", json={"name": " "}).status_code == 400


def test_team_tournament_still_needs_both_players(client, t_id):
    assert client.get(f"/api/tournaments/{t_id}").json()["is_singles"] is False
    res = client.post(f"/api/tournaments/{t_id}/teams", json={"name": "T", "player1_name": "A"})
    assert res.status_code == 400


def test_type_cannot_be_changed_later(client):
    t_id = singles_tournament(client)
    client.put(f"/api/tournaments/{t_id}", json={"is_singles": False, "best_of_sets": 3})
    t = client.get(f"/api/tournaments/{t_id}").json()
    assert (t["is_singles"], t["best_of_sets"]) == (True, 3)


def test_swiss_match_is_one_game_scored_in_sets(client):
    t_id = singles_tournament(client, best_of_sets=3)
    ids = add_players(client, t_id, 3)
    round_data = client.post(f"/api/tournaments/{t_id}/rounds/next-swiss").json()
    [match] = [m for m in round_data["team_matches"] if not m["is_bye"]]
    [bye] = [m for m in round_data["team_matches"] if m["is_bye"]]
    assert (bye["score_a"], bye["score_b"]) == (2, 0)  # bye: won without losing a set

    [game] = match["individual_games"]
    assert (game["game_order"], game["is_doubles"]) == (1, False)
    assert game["player_a_name"] == match["team_a"]["name"]
    assert game["player_b_name"] == match["team_b"]["name"]

    # Best of 3: 3 sets aren't valid
    assert client.post(f"/api/matches/{match['id']}/games/{game['id']}/result",
                       json={"sets_a": 3, "sets_b": 1}).status_code == 400
    done = enter(client, match, 1, 2)
    assert (done["score_a"], done["score_b"], done["is_completed"]) == (1, 2, True)
    assert done["winner_team_id"] == match["team_b_id"]

    standings = {s["team_id"]: s for s in client.get(f"/api/tournaments/{t_id}/standings").json()}
    winner, loser = standings[match["team_b_id"]], standings[match["team_a_id"]]
    bye_player = standings[bye["team_a_id"]]
    assert (winner["won_matches"], winner["game_points"], winner["sets_won"], winner["sets_lost"]) == (1, 1, 2, 1)
    assert (loser["lost_matches"], loser["game_points"], loser["game_points_lost"]) == (1, 0, 1)
    assert (bye_player["game_points"], bye_player["sets_won"]) == (1, 2)
    assert set(standings) == set(ids)

    # 0:0 reopens the match
    reopened = enter(client, match, 0, 0)
    assert (reopened["score_a"], reopened["score_b"], reopened["is_completed"]) == (0, 0, False)


def test_ko_without_doubles(client):
    t_id = singles_tournament(client)
    add_players(client, t_id, 4)
    semis = client.post(f"/api/tournaments/{t_id}/rounds/start-ko", params={"team_count": 4}).json()
    for m in semis["team_matches"]:
        assert len(m["individual_games"]) == 1
        done = enter(client, m, 3, 2)
        assert done["is_completed"] is True
        assert done["winner_team_id"] == m["team_a_id"]
        assert len(done["individual_games"]) == 1
    final = client.post(f"/api/tournaments/{t_id}/rounds/advance-ko").json()
    assert final["ko_stage"] == "Finale"
    tree = client.get(f"/api/monitors/{t_id}/dashboard").json()
    assert tree["is_singles"] is True
    assert (tree["ko_tree"][0]["matches"][0]["score_a"], tree["ko_tree"][0]["matches"][0]["score_b"]) == (3, 2)


def test_swap_keeps_one_game(client):
    t_id = singles_tournament(client)
    add_players(client, t_id, 4)
    m1, m2 = client.post(f"/api/tournaments/{t_id}/rounds/next-swiss").json()["team_matches"]
    round_id = m1["round_id"]
    assert client.post(f"/api/rounds/{round_id}/swap-pairings",
                       json={"match_id_1": m1["id"], "match_id_2": m2["id"]}).status_code == 200
    swapped = client.get(f"/api/matches/{m1['id']}").json()
    assert swapped["team_b_id"] == m2["team_b_id"]
    [game] = swapped["individual_games"]
    assert game["player_b_name"] == m2["team_b"]["name"]


def test_csv_import_and_export(client):
    t_id = singles_tournament(client)
    csv = "Spieler;Verein\nAnna;TV A\n\nBernd\n;leer\n".encode()
    res = client.post(f"/api/tournaments/{t_id}/teams/csv", files={"file": ("s.csv", io.BytesIO(csv), "text/csv")})
    assert res.json() == {"message": "2 Spieler erfolgreich importiert", "teams": ["Anna", "Bernd"]}

    export = client.get(f"/api/tournaments/{t_id}/export/csv").content.decode("utf-8-sig").splitlines()
    assert export[0] == "Platz;Spieler;Spiele;S;N;Buchholz;Sätze+;Sätze-;Satz-Diff"
    assert export[1].split(";")[1] in {"Anna", "Bernd"}


def test_archive_pdf_and_too_few_players(client):
    t_id = singles_tournament(client)
    add_players(client, t_id, 1)
    res = client.post(f"/api/tournaments/{t_id}/rounds/next-swiss")
    assert (res.status_code, res.json()["detail"]) == (400, "Es werden mindestens 2 Spieler benötigt.")
    add_players(client, t_id, 2)
    match = next(m for m in client.post(f"/api/tournaments/{t_id}/rounds/next-swiss").json()["team_matches"]
                 if not m["is_bye"])
    enter(client, match, 3, 0)
    pdf = client.get(f"/api/tournaments/{t_id}/export/pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")


def test_live_entry_marks_singles(client):
    t_id = singles_tournament(client)
    add_players(client, t_id, 2)
    client.post(f"/api/tournaments/{t_id}/rounds/next-swiss")
    [live] = [m for m in client.get("/api/matches/live").json() if m["tournament_id"] == t_id]
    assert live["is_singles"] is True
    assert live["active_game_desc"].startswith("Spiel: ")


def game(side, sets_a, sets_b):
    return SimpleNamespace(game_order=1, is_doubles=False, is_completed=side is not None,
                           winner_team_side=side, sets_won_a=sets_a, sets_won_b=sets_b)


@pytest.mark.parametrize("round_type", ["swiss", "ko"])
def test_rules_for_one_game(round_type):
    open_result = match_rules.match_result(round_type, [game(None, 0, 0)], singles_count=1)
    assert (open_result.is_completed, open_result.winner_side) == (False, None)
    result = match_rules.match_result(round_type, [game("B", 1, 3)], singles_count=1)
    assert result == match_rules.MatchResult(1, 3, True, "B", needs_doubles=False, drop_doubles=False)
    assert match_rules.match_result(round_type, [], singles_count=1).is_completed is False


def test_points_and_bye():
    assert match_rules.singles_per_match(True) == 1 and match_rules.singles_per_match(False) == 4
    assert match_rules.match_points(3, 1, "A", 1) == (1, 0)
    assert match_rules.match_points(1, 3, "B", 1) == (0, 1)
    assert match_rules.match_points(0, 0, None, 1) == (0, 0)
    assert match_rules.match_points(3, 1, "A", 4) == (3, 1)
    assert match_rules.bye_result(1, 3).score_a == 2
    assert match_rules.bye_sets(5, 1) == 3
