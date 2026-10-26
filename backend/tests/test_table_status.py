def test_two_table_match_shows_on_both_tables_with_its_open_game(client, t_id, add_teams, play):
    client.put(f"/api/tournaments/{t_id}", json={"tables_per_match": 2, "table_count": 4})
    add_teams(t_id, 4)
    r = client.post(f"/api/tournaments/{t_id}/rounds/start-ko", params={"team_count": 4}).json()
    sf = next(m for m in r["team_matches"] if m["ko_slot"] == 1)
    play(sf["id"], "ABAB")

    tables = {t["table_number"]: t for t in client.get(f"/api/tables/status/{t_id}").json()}

    assert tables[1]["current_team_match_id"] == tables[2]["current_team_match_id"] == sf["id"]
    # Only the deciding doubles is left, on the first table; the second table shows it too
    assert tables[1]["active_game_desc"].startswith("Doppel: ")
    assert tables[2]["active_game_desc"] == tables[1]["active_game_desc"]
    assert (tables[1]["match_score_a"], tables[1]["match_score_b"]) == (2, 2)
    assert client.get(f"/api/monitors/{t_id}/dashboard").json()["tables"] == list(tables.values())
