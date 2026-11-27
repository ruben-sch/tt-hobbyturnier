"""Several tournaments (one per class, e.g. Hobby and Jugend) run at once; abgeschlossene ones stay as history."""

import pytest
from sqlalchemy import text

from backend.app.database import Base, engine
from backend.app.websocket_hub import ws_manager


@pytest.fixture
def events(monkeypatch):
    sent = []

    async def capture(message):
        sent.append(message)

    monkeypatch.setattr(ws_manager, "broadcast", capture)
    return sent


def test_new_tournament_runs_next_to_the_others(client, t_id, add_teams, events):
    add_teams(t_id, 2)
    client.post(f"/api/tournaments/{t_id}/rounds/next-swiss")

    res = client.post("/api/tournaments", json={"name": " Jugend ", "best_of_sets": 3})
    assert res.status_code == 200
    jugend = res.json()
    assert (jugend["name"], jugend["is_active"], jugend["best_of_sets"]) == ("Jugend", True, 3)
    assert {"type": "TOURNAMENT_CREATED", "tournament_id": jugend["id"]} in events

    # Newest first; the first tournament keeps running with its round
    listed = client.get("/api/tournaments").json()
    assert [(t["id"], t["is_active"]) for t in listed] == [(jugend["id"], True), (t_id, True)]
    assert client.get(f"/api/tournaments/{t_id}").json()["current_round_number"] == 1

    # Each tournament has its own rounds
    add_teams(jugend["id"], 2)
    assert client.post(f"/api/tournaments/{jugend['id']}/rounds/next-swiss").json()["round_number"] == 1


def test_tournament_name_is_required(client, t_id):
    assert client.post("/api/tournaments", json={"name": "  "}).status_code == 400


def test_close_reopen_and_delete(client, t_id, add_teams, play, events):
    add_teams(t_id, 2)
    match = client.post(f"/api/tournaments/{t_id}/rounds/next-swiss").json()["team_matches"][0]
    play(match["id"], "AAAA")

    # Running tournaments can't be deleted
    res = client.delete(f"/api/tournaments/{t_id}")
    assert res.status_code == 400
    assert "abgeschlossene" in res.json()["detail"]

    res = client.put(f"/api/tournaments/{t_id}", json={"is_active": False})
    assert res.json()["is_active"] is False
    assert {"type": "TOURNAMENT_UPDATED", "tournament_id": t_id} in events
    # Abgeschlossen: out of result entry, still viewable and editable
    assert client.get("/api/matches/live").json() == []
    assert len(client.get(f"/api/tournaments/{t_id}/standings").json()) == 2
    game = client.get(f"/api/matches/{match['id']}").json()["individual_games"][0]
    assert client.post(f"/api/matches/{match['id']}/games/{game['id']}/result",
                       json={"sets_a": 0, "sets_b": 3}).status_code == 200

    assert client.put(f"/api/tournaments/{t_id}", json={"is_active": True}).json()["is_active"] is True
    assert len(client.get("/api/matches/live").json()) == 1

    client.put(f"/api/tournaments/{t_id}", json={"is_active": False})
    other = client.post("/api/tournaments", json={"name": "Jugend"}).json()
    assert client.delete(f"/api/tournaments/{t_id}").status_code == 200
    assert {"type": "TOURNAMENT_DELETED", "tournament_id": t_id} in events
    assert client.get(f"/api/tournaments/{t_id}").status_code == 404
    assert [t["id"] for t in client.get("/api/tournaments").json()] == [other["id"]]
    assert client.delete(f"/api/tournaments/{t_id}").status_code == 404


def test_deleting_the_last_tournament_starts_a_fresh_one(client, t_id):
    client.put(f"/api/tournaments/{t_id}", json={"is_active": False})
    assert client.delete(f"/api/tournaments/{t_id}").status_code == 200
    [fresh] = client.get("/api/tournaments").json()
    assert (fresh["name"], fresh["is_active"], fresh["current_round_number"]) == ("Tischtennis Hobbyturnier", True, 0)


def test_live_events_name_their_tournament(client, t_id, add_teams, play, events):
    add_teams(t_id, 4)
    r = client.post(f"/api/tournaments/{t_id}/rounds/next-swiss").json()
    m1, m2 = r["team_matches"]
    client.post(f"/api/rounds/{r['id']}/swap-pairings", json={"match_id_1": m1["id"], "match_id_2": m2["id"]})
    play(m1["id"], "A")

    assert all(e.get("tournament_id") == t_id for e in events), events
    assert {e["type"] for e in events} >= {"TEAMS_UPDATED", "ROUND_GENERATED", "ROUND_UPDATED", "SCORE_UPDATE"}


def test_database_from_before_parallel_tournaments(client):
    """An existing tt_turnier.db keeps working: the old table and PIN columns are simply left unused."""
    Base.metadata.drop_all(bind=engine)
    with engine.begin() as db:
        db.execute(text(
            "CREATE TABLE tournaments (id INTEGER NOT NULL PRIMARY KEY, name VARCHAR(200) NOT NULL, "
            "created_at DATETIME, is_active BOOLEAN, swiss_rounds_count INTEGER, current_round_number INTEGER, "
            "ko_enabled BOOLEAN, ko_teams_count INTEGER, best_of_sets INTEGER, table_count INTEGER, "
            "tables_per_match INTEGER, admin_pin VARCHAR(20))"
        ))
        db.execute(text(
            "INSERT INTO tournaments VALUES "
            "(1, 'Hobbyturnier 1.11.', NULL, 1, 5, 0, 0, 4, 5, 8, 1, 'alt-pin')"
        ))
        db.execute(text(
            "CREATE TABLE team_matches (id INTEGER NOT NULL PRIMARY KEY, round_id INTEGER NOT NULL, "
            "team_a_id INTEGER NOT NULL, team_b_id INTEGER, table_number INTEGER, table_number_b INTEGER, "
            "team_a_p1_name VARCHAR(100), team_a_p2_name VARCHAR(100), team_b_p1_name VARCHAR(100), "
            "team_b_p2_name VARCHAR(100), score_a INTEGER, score_b INTEGER, is_completed BOOLEAN, "
            "winner_team_id INTEGER, ko_slot INTEGER, next_match_id INTEGER)"
        ))
        db.execute(text(
            "CREATE TABLE individual_games (id INTEGER NOT NULL PRIMARY KEY, team_match_id INTEGER NOT NULL, "
            "game_order INTEGER NOT NULL, is_doubles BOOLEAN, table_number INTEGER, player_a_name VARCHAR(100), "
            "player_b_name VARCHAR(100), sets_won_a INTEGER, sets_won_b INTEGER, is_completed BOOLEAN, "
            "winner_team_side VARCHAR(1))"
        ))
    Base.metadata.create_all(bind=engine)

    [old] = client.get("/api/tournaments").json()
    assert (old["id"], old["name"], old["is_active"]) == (1, "Hobbyturnier 1.11.", True)
    # The old per-tournament PIN no longer counts, TT_ADMIN_PIN does
    assert client.get("/api/tournaments/admin-check", headers={"X-Admin-Pin": "alt-pin"}).status_code == 403

    for i in range(2):
        client.post("/api/tournaments/1/teams", json={"name": f"T{i}", "player1_name": "a", "player2_name": "b"})
    match = client.post("/api/tournaments/1/rounds/next-swiss").json()["team_matches"][0]
    game = match["individual_games"][0]
    assert client.post(f"/api/matches/{match['id']}/games/{game['id']}/result",
                       json={"sets_a": 3, "sets_b": 1}).status_code == 200
    assert client.put("/api/tournaments/1", json={"is_active": False}).status_code == 200
    assert client.get("/api/tournaments/1/export/pdf").status_code == 200
