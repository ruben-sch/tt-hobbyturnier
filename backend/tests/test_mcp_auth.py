import base64
import hashlib
from urllib.parse import parse_qs, urlparse

import pytest

from backend.app.mcp_auth import MAX_PIN_ATTEMPTS, provider

CALLBACK = "https://claude.ai/api/mcp/auth_callback"
MCP_HEADERS = {"Accept": "application/json, text/event-stream"}
LIST_TOOLS = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
VERIFIER = "x" * 64
CHALLENGE = base64.urlsafe_b64encode(hashlib.sha256(VERIFIER.encode()).digest()).rstrip(b"=").decode()


@pytest.fixture
def oauth(mcp_http, t_id):
    """Drives the OAuth flow the way claude.ai does."""
    provider.pending.clear()
    provider.codes.clear()

    class Flow:
        def register(self, redirect_uri=CALLBACK):
            return mcp_http.post("/register", json={
                "redirect_uris": [redirect_uri], "client_name": "Claude", "token_endpoint_auth_method": "none",
                "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"],
            })

        def start_login(self):
            self.client_id = self.register().json()["client_id"]
            res = mcp_http.get("/authorize", follow_redirects=False, params={
                "response_type": "code", "client_id": self.client_id, "redirect_uri": CALLBACK,
                "code_challenge": CHALLENGE, "code_challenge_method": "S256", "state": "abc",
            })
            assert res.status_code == 302, res.text
            login = urlparse(res.headers["location"])
            assert login.path == "/oauth/login"
            return parse_qs(login.query)["request"][0]

        def enter_pin(self, request_id, pin):
            return mcp_http.post("/oauth/login", data={"request": request_id, "pin": pin}, follow_redirects=False)

        def tokens(self):
            res = self.enter_pin(self.start_login(), "admin123")
            callback = parse_qs(urlparse(res.headers["location"]).query)
            assert callback["state"] == ["abc"]
            return self.exchange(code=callback["code"][0])

        def exchange(self, **grant):
            data = {"client_id": self.client_id}
            if "code" in grant:
                data |= {"grant_type": "authorization_code", "redirect_uri": CALLBACK, "code_verifier": VERIFIER}
            else:
                data |= {"grant_type": "refresh_token"}
            return mcp_http.post("/token", data=data | grant).json()

        def list_tools(self, token):
            return mcp_http.post("/mcp", headers={**MCP_HEADERS, "Authorization": f"Bearer {token}"}, json=LIST_TOOLS)

    return Flow()


def test_discovery_metadata(mcp_http):
    resource = mcp_http.get("/.well-known/oauth-protected-resource/mcp").json()
    assert resource["resource"].endswith("/mcp")
    server = mcp_http.get("/.well-known/oauth-authorization-server").json()
    assert server["authorization_endpoint"].endswith("/authorize")
    assert "S256" in server["code_challenge_methods_supported"]


def test_full_login_gives_a_working_token(oauth, mcp_http):
    request_id = oauth.start_login()
    page = mcp_http.get("/oauth/login", params={"request": request_id})
    assert "Claude" in page.text and "claude.ai" in page.text

    wrong = oauth.enter_pin(request_id, "falsch")
    assert wrong.status_code == 200 and "Falsche Admin-PIN." in wrong.text

    ok = oauth.enter_pin(request_id, "admin123")
    assert ok.status_code == 302 and ok.headers["location"].startswith(CALLBACK)
    code = parse_qs(urlparse(ok.headers["location"]).query)["code"][0]

    tokens = oauth.exchange(code=code)
    assert oauth.list_tools(tokens["access_token"]).status_code == 200
    # A code works once
    assert "access_token" not in oauth.exchange(code=code)


def test_refresh_rotates_the_tokens(oauth):
    first = oauth.tokens()
    second = oauth.exchange(refresh_token=first["refresh_token"])

    assert oauth.list_tools(second["access_token"]).status_code == 200
    assert oauth.list_tools(first["access_token"]).status_code == 401
    assert "access_token" not in oauth.exchange(refresh_token=first["refresh_token"])


def test_new_admin_pin_revokes_tokens(oauth, client, t_id):
    tokens = oauth.tokens()
    client.put(f"/api/tournaments/{t_id}", json={"admin_pin": "neu"})

    assert oauth.list_tools(tokens["access_token"]).status_code == 401
    assert "access_token" not in oauth.exchange(refresh_token=tokens["refresh_token"])


def test_revoke_endpoint(oauth, mcp_http):
    tokens = oauth.tokens()
    # The SDK's revocation form requires client_secret, even for public clients
    res = mcp_http.post("/revoke", data={
        "token": tokens["refresh_token"], "client_id": oauth.client_id, "client_secret": "",
    })
    assert res.status_code == 200
    assert oauth.list_tools(tokens["access_token"]).status_code == 401


def test_only_https_or_localhost_redirects(oauth):
    assert oauth.register("http://evil.example/cb").status_code == 400
    assert oauth.register("http://localhost:33418/callback").status_code == 201


def test_too_many_wrong_pins_end_the_login(oauth, mcp_http):
    request_id = oauth.start_login()
    for _ in range(MAX_PIN_ATTEMPTS - 1):
        assert oauth.enter_pin(request_id, "falsch").status_code == 200
    assert oauth.enter_pin(request_id, "falsch").status_code == 403

    assert oauth.enter_pin(request_id, "admin123").status_code == 400
    assert mcp_http.get("/oauth/login", params={"request": request_id}).status_code == 400
