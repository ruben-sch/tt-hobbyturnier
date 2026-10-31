"""Wrong admin PINs lock the sending client out, so the PIN can't be brute-forced (issue #30)."""

import pytest
from fastapi.testclient import TestClient

from backend.app import auth
from backend.app.auth import MAX_PIN_FAILURES, PIN_FAILURE_WINDOW, client_key, pin_attempts
from backend.app.main import app
from backend.tests.test_mcp_auth import LIST_TOOLS, MCP_HEADERS, oauth  # noqa: F401 (fixture)


def admin_check(http, t_id, pin):
    return http.get(f"/api/tournaments/{t_id}/admin-check", headers={"X-Admin-Pin": pin})


def guess_wrong(http, t_id, times=MAX_PIN_FAILURES):
    for i in range(times):
        assert admin_check(http, t_id, f"{i:04d}").status_code == 403


@pytest.fixture
def clock(monkeypatch):
    now = [1000.0]
    monkeypatch.setattr(auth.time, "monotonic", lambda: now[0])
    return now


def test_too_many_wrong_pins_lock_the_client_out(client, t_id):
    guess_wrong(client, t_id)

    res = admin_check(client, t_id, "falsch")
    assert res.status_code == 429
    assert "Zu viele falsche Admin-PINs" in res.json()["detail"]
    assert 0 < int(res.headers["Retry-After"]) <= PIN_FAILURE_WINDOW
    # While locked out the PIN is not checked at all, so a lucky guess doesn't get through
    assert admin_check(client, t_id, "admin123").status_code == 429
    assert client.post(f"/api/tournaments/{t_id}/teams", json={
        "name": "X", "player1_name": "A", "player2_name": "B"}).status_code == 429


def test_lockout_is_per_client(client, t_id):
    guess_wrong(client, t_id)
    other = TestClient(app, client=("203.0.113.7", 1234))
    assert admin_check(other, t_id, "admin123").status_code == 200


def test_correct_pin_forgives_earlier_typos(client, t_id):
    guess_wrong(client, t_id, MAX_PIN_FAILURES - 1)
    assert admin_check(client, t_id, "admin123").status_code == 200
    guess_wrong(client, t_id, MAX_PIN_FAILURES - 1)
    assert admin_check(client, t_id, "admin123").status_code == 200


def test_missing_pin_does_not_count(client, t_id):
    for _ in range(MAX_PIN_FAILURES + 1):
        assert admin_check(client, t_id, "").status_code == 401
    assert admin_check(client, t_id, "admin123").status_code == 200


def test_lockout_ends_after_the_window(client, t_id, clock):
    guess_wrong(client, t_id)
    clock[0] += PIN_FAILURE_WINDOW - 60
    res = admin_check(client, t_id, "admin123")
    assert res.status_code == 429
    assert res.json()["detail"].endswith("in 1 Minute erneut versuchen.")
    clock[0] += 61
    assert admin_check(client, t_id, "admin123").status_code == 200


def test_stale_clients_are_dropped(clock, monkeypatch):
    pin_attempts.record_failure("198.51.100.1")
    clock[0] += PIN_FAILURE_WINDOW + 1
    monkeypatch.setattr(auth, "MAX_TRACKED_CLIENTS", 1)
    pin_attempts.record_failure("198.51.100.2")
    assert "198.51.100.1" not in pin_attempts._failures
    assert pin_attempts.retry_after("198.51.100.2") == 0


@pytest.mark.parametrize(("host", "key"), [
    ("192.0.2.10", "192.0.2.10"),
    ("::ffff:192.0.2.10", "192.0.2.10"),
    ("2001:db8:1:2:aaaa::1", "2001:db8:1:2::/64"),
    ("testclient", "testclient"),
    (None, "unknown"),
])
def test_client_key(host, key):
    assert client_key(host) == key


def mcp_list_tools(http, token):
    return http.post("/mcp", headers={**MCP_HEADERS, "Authorization": f"Bearer {token}"}, json=LIST_TOOLS)


def test_wrong_pins_as_mcp_bearer_lock_out(mcp_http, t_id):
    for i in range(MAX_PIN_FAILURES):
        assert mcp_list_tools(mcp_http, f"{i:04d}").status_code == 401
    assert mcp_list_tools(mcp_http, "admin123").status_code == 401
    assert mcp_http.post("/mcp", headers={**MCP_HEADERS, "X-Admin-Pin": "admin123"}, json=LIST_TOOLS).status_code == 401


def test_oauth_tokens_keep_working_and_dont_count(oauth, mcp_http, t_id):  # noqa: F811
    token = oauth.tokens()["access_token"]
    for _ in range(MAX_PIN_FAILURES + 1):
        assert mcp_list_tools(mcp_http, "x" * 43).status_code == 401
    assert mcp_list_tools(mcp_http, "admin123").status_code == 200
    guess_wrong(mcp_http, t_id)
    assert mcp_list_tools(mcp_http, token).status_code == 200


def test_new_oauth_logins_dont_reset_the_count(oauth, mcp_http):  # noqa: F811
    for i in range(MAX_PIN_FAILURES):
        request_id = oauth.start_login()
        assert oauth.enter_pin(request_id, f"{i:04d}").status_code == 200
    res = oauth.enter_pin(oauth.start_login(), "admin123")
    assert res.status_code == 429
    assert "Zu viele falsche Admin-PINs" in res.text
