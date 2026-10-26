import pytest
from mcp.server.mcpserver.exceptions import ToolError

from backend.app import mcp_server

ADMIN = {"X-Admin-Pin": "admin123"}
MCP_HEADERS = {"Accept": "application/json, text/event-stream"}
LIST_TOOLS = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}


@pytest.fixture
def call(mcp_http, clean_db):
    """Calls an MCP tool with the admin PIN; returns (is_error, structured result or error text)."""
    def _call(tool, arguments=None, headers=ADMIN):
        res = mcp_http.post("/mcp", headers={**MCP_HEADERS, **headers}, json={
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {"name": tool, "arguments": arguments or {}},
        })
        assert res.status_code == 200, res.text
        result = res.json()["result"]
        if result.get("isError"):
            return True, result["content"][0]["text"].split(": ", 1)[-1]  # drop "Error executing tool x: "
        return False, result["structuredContent"]["result"]
    return _call


@pytest.fixture
def running_match(client, t_id, add_teams):
    add_teams(t_id, 2)
    return client.post(f"/api/tournaments/{t_id}/rounds/next-swiss").json()["team_matches"][0]


def test_lists_the_tools(mcp_http, t_id):
    res = mcp_http.post("/mcp", headers={**MCP_HEADERS, **ADMIN}, json=LIST_TOOLS)
    names = {t["name"] for t in res.json()["result"]["tools"]}
    assert names == {"get_tournament", "get_standings", "get_round", "get_live_status", "enter_game_result"}


def test_read_tools(call, running_match):
    error, tournament = call("get_tournament")
    assert not error
    assert tournament["current_round_number"] == 1
    assert "admin_pin" not in tournament
    assert tournament["rounds"][0]["is_active"] is True

    error, round_ = call("get_round")
    assert not error
    match = round_["matches"][0]
    assert match["match_id"] == running_match["id"]
    assert [g["game"] for g in match["games"]] == ["Einzel 1", "Einzel 2", "Einzel 3", "Einzel 4"]
    assert call("get_round", {"round_number": 1})[1] == round_
    assert call("get_round", {"round_number": 9}) == (True, "Runde nicht gefunden.")

    error, standings = call("get_standings")
    assert not error and len(standings) == 2

    error, live = call("get_live_status")
    assert not error
    assert (live["round_number"], live["open_matches"]) == (1, 1)
    busy = [t for t in live["tables"] if t["is_active"]]
    assert busy[0]["current_team_match_id"] == running_match["id"]


@pytest.mark.parametrize("headers", [ADMIN, {"Authorization": "Bearer admin123"}])
def test_enter_game_result_with_admin_pin(call, running_match, headers):
    game_id = running_match["individual_games"][0]["id"]
    args = {"match_id": running_match["id"], "game_id": game_id, "sets_a": 3, "sets_b": 1}

    error, match = call("enter_game_result", args, headers)
    assert not error
    assert match["score"] == "1:0"
    assert match["games"][0]["sets"] == "3:1"

    _, live = call("get_live_status")
    busy = next(t for t in live["tables"] if t["is_active"])
    assert (busy["match_score_a"], busy["match_score_b"]) == (1, 0)


@pytest.mark.parametrize("headers", [{}, {"X-Admin-Pin": "falsch"}, {"Authorization": "Bearer falsch"}])
def test_requires_the_admin_pin_or_a_token(mcp_http, t_id, headers):
    res = mcp_http.post("/mcp", headers={**MCP_HEADERS, **headers}, json=LIST_TOOLS)
    assert res.status_code == 401
    assert "oauth-protected-resource" in res.headers["www-authenticate"]


def test_enter_game_result_rejects_bad_results(call, running_match):
    game_id = running_match["individual_games"][0]["id"]
    args = {"match_id": running_match["id"], "game_id": game_id, "sets_a": 3, "sets_b": 0}

    error, message = call("enter_game_result", {**args, "sets_a": 4})
    assert error and "Ungültiges Ergebnis" in message
    assert call("enter_game_result", {**args, "match_id": 999}) == (True, "Begegnung nicht gefunden")

    _, round_ = call("get_round")
    assert round_["matches"][0]["score"] == "0:0"


def test_without_tournament(clean_db):
    # Unreachable over HTTP: without a tournament there is no PIN to authenticate with
    with pytest.raises(ToolError, match="Kein aktives Turnier."):
        mcp_server.get_live_status()


def test_before_the_first_round(call, t_id):
    error, live = call("get_live_status")
    assert not error
    assert (live["round_number"], live["open_matches"]) == (None, 0)
    assert call("get_round") == (True, "Runde nicht gefunden.")
