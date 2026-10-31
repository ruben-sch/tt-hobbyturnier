"""OAuth for the MCP server, so claude.ai can connect as a custom connector.

The app is its own small authorization server: the login step is entering the admin PIN
of the active tournament. Every /mcp request needs a bearer token, which is either an
OAuth access token issued here or the admin PIN itself (for Claude Code / Desktop).

Pending logins and authorization codes live in memory (single process, minutes long);
clients and tokens are in SQLite so they survive restarts. Tokens are stored hashed and
bound to the admin PIN they were issued under: changing the PIN revokes them all.
"""

import hashlib
import html
import os
import secrets
import time
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    RefreshToken,
    RegistrationError,
    TokenError,
    construct_redirect_uri,
)
from mcp.server.auth.settings import AuthSettings, ClientRegistrationOptions, RevocationOptions
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken

from backend.app.auth import active_tournament, check_admin_pin, client_key, locked_out_message, pin_attempts
from backend.app.database import SessionLocal
from backend.app.models import OAuthClient
from backend.app.models import OAuthToken as StoredToken

PUBLIC_URL = os.getenv("TT_PUBLIC_URL", "http://localhost:8000").rstrip("/")
SCOPE = "turnierleitung"
ADMIN_PIN_CLIENT = "admin-pin"  # client_id of requests that send the PIN itself as bearer token

ACCESS_TOKEN_TTL = 60 * 60
REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60
LOGIN_TTL = 10 * 60
CODE_TTL = 5 * 60
MAX_PIN_ATTEMPTS = 5
# Issued tokens are token_urlsafe(32), 43 characters. A shorter bearer may be a PIN guess and
# counts towards the client's lockout; a longer one is a token (a PIN that long can't be guessed).
TOKEN_LENGTH = 43

# Client address of the current /mcp request, set by PinHeaderAsBearer for load_access_token.
current_client: ContextVar[Optional[str]] = ContextVar("current_client", default=None)

auth_settings = AuthSettings(
    issuer_url=PUBLIC_URL,
    resource_server_url=f"{PUBLIC_URL}/mcp",
    validate_token_resource=False,  # tokens are not bound to a resource; there is only this one
    client_registration_options=ClientRegistrationOptions(
        enabled=True, valid_scopes=[SCOPE], default_scopes=[SCOPE]
    ),
    revocation_options=RevocationOptions(enabled=True),
    required_scopes=[SCOPE],
)


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _current_pin_fingerprint() -> Optional[str]:
    with SessionLocal() as db:
        tournament = active_tournament(db)
        return _hash(tournament.admin_pin) if tournament else None


def _pin_is_valid(pin: str, client: Optional[str] = None) -> bool:
    """With a client key, wrong PINs count towards its lockout, and a locked-out client never passes."""
    with SessionLocal() as db:
        tournament = active_tournament(db)
        if tournament is None:
            return False
        try:
            check_admin_pin(tournament, pin, client)
        except HTTPException:
            return False
        return True


def _allowed_redirect(uri: str) -> bool:
    """HTTPS anywhere, plain HTTP only back to the user's own machine (desktop clients)."""
    parsed = urlparse(uri)
    if parsed.scheme == "https":
        return True
    return parsed.scheme == "http" and parsed.hostname in ("localhost", "127.0.0.1", "::1")


@dataclass
class PendingLogin:
    client: OAuthClientInformationFull
    params: AuthorizationParams
    expires_at: float
    attempts: int = 0


@dataclass
class TournamentOAuthProvider:
    pending: Dict[str, PendingLogin] = field(default_factory=dict)
    codes: Dict[str, AuthorizationCode] = field(default_factory=dict)

    # --- clients ---

    async def get_client(self, client_id: str) -> Optional[OAuthClientInformationFull]:
        with SessionLocal() as db:
            row = db.get(OAuthClient, client_id)
            return OAuthClientInformationFull.model_validate_json(row.data) if row else None

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        for uri in client_info.redirect_uris or []:
            if not _allowed_redirect(str(uri)):
                raise RegistrationError("invalid_redirect_uri", f"Redirect-URI nicht erlaubt: {uri}")
        with SessionLocal() as db:
            db.merge(OAuthClient(client_id=client_info.client_id, data=client_info.model_dump_json()))
            db.commit()

    # --- authorization: the admin PIN form in login_router ---

    async def authorize(self, client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
        self._expire()
        request_id = secrets.token_urlsafe(32)
        self.pending[request_id] = PendingLogin(client, params, time.time() + LOGIN_TTL)
        return f"{PUBLIC_URL}/oauth/login?request={request_id}"

    def complete_login(self, request_id: str, pin: str, client: Optional[str] = None) -> Optional[str]:
        """Checks the PIN of a pending login. Returns the redirect URL with the code, or None."""
        login = self.pending[request_id]
        if not _pin_is_valid(pin, client):
            login.attempts += 1
            if login.attempts >= MAX_PIN_ATTEMPTS:
                del self.pending[request_id]
            return None
        del self.pending[request_id]
        code = AuthorizationCode(
            code=secrets.token_urlsafe(32),
            scopes=login.params.scopes or [SCOPE],
            expires_at=time.time() + CODE_TTL,
            client_id=login.client.client_id,
            code_challenge=login.params.code_challenge,
            redirect_uri=login.params.redirect_uri,
            redirect_uri_provided_explicitly=login.params.redirect_uri_provided_explicitly,
            resource=login.params.resource,
            subject="turnierleitung",
        )
        self.codes[code.code] = code
        return construct_redirect_uri(str(login.params.redirect_uri), code=code.code, state=login.params.state)

    def pending_login(self, request_id: str) -> Optional[PendingLogin]:
        self._expire()
        return self.pending.get(request_id)

    def _expire(self) -> None:
        now = time.time()
        for store in (self.pending, self.codes):
            for key in [k for k, v in store.items() if v.expires_at < now]:
                del store[key]

    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> Optional[AuthorizationCode]:
        self._expire()
        code = self.codes.get(authorization_code)
        return code if code and code.client_id == client.client_id else None

    async def exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode
    ) -> OAuthToken:
        if self.codes.pop(authorization_code.code, None) is None:
            raise TokenError("invalid_grant", "Code wurde bereits verwendet.")
        return self._issue(client.client_id, authorization_code.scopes)

    # --- tokens ---

    def _issue(self, client_id: str, scopes: List[str]) -> OAuthToken:
        fingerprint = _current_pin_fingerprint()
        if fingerprint is None:
            raise TokenError("invalid_grant", "Kein aktives Turnier.")
        access, refresh = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        grant_id = secrets.token_hex(16)
        now = int(time.time())
        with SessionLocal() as db:
            for token, kind, ttl in ((access, "access", ACCESS_TOKEN_TTL), (refresh, "refresh", REFRESH_TOKEN_TTL)):
                db.add(StoredToken(
                    token_hash=_hash(token), kind=kind, client_id=client_id, grant_id=grant_id,
                    pin_fingerprint=fingerprint, expires_at=now + ttl,
                ))
            db.query(StoredToken).filter(StoredToken.expires_at < now).delete()
            db.commit()
        return OAuthToken(
            access_token=access, expires_in=ACCESS_TOKEN_TTL, scope=" ".join(scopes), refresh_token=refresh
        )

    def _load(self, token: str, kind: str) -> Optional[StoredToken]:
        with SessionLocal() as db:
            row = db.get(StoredToken, _hash(token))
            if row is None or row.kind != kind or row.expires_at < time.time():
                return None
            if row.pin_fingerprint != _current_pin_fingerprint():
                return None
            db.expunge(row)
            return row

    async def load_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: str
    ) -> Optional[RefreshToken]:
        row = self._load(refresh_token, "refresh")
        if row is None or row.client_id != client.client_id:
            return None
        return RefreshToken(token=refresh_token, client_id=row.client_id, scopes=[SCOPE], expires_at=row.expires_at)

    async def exchange_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: RefreshToken, scopes: List[str]
    ) -> OAuthToken:
        await self.revoke_token(refresh_token)
        return self._issue(client.client_id, scopes or [SCOPE])

    async def load_access_token(self, token: str) -> Optional[AccessToken]:
        client = current_client.get() if len(token) < TOKEN_LENGTH else None
        if _pin_is_valid(token, client):
            return AccessToken(token=token, client_id=ADMIN_PIN_CLIENT, scopes=[SCOPE], subject="turnierleitung")
        row = self._load(token, "access")
        if row is None:
            return None
        return AccessToken(
            token=token, client_id=row.client_id, scopes=[SCOPE], expires_at=row.expires_at, subject="turnierleitung"
        )

    async def revoke_token(self, token) -> None:
        with SessionLocal() as db:
            row = db.get(StoredToken, _hash(token.token))
            if row is not None:
                db.query(StoredToken).filter(StoredToken.grant_id == row.grant_id).delete()
                db.commit()


provider = TournamentOAuthProvider()


class PinHeaderAsBearer:
    """Lets clients keep sending `X-Admin-Pin`: it is turned into `Authorization: Bearer <PIN>`.
    Also notes the client address, so wrong PINs as bearer count towards its lockout."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            current_client.set(client_key(scope["client"][0] if scope.get("client") else None))
            headers = dict(scope["headers"])
            pin = headers.get(b"x-admin-pin")
            if pin and b"authorization" not in headers:
                scope = {**scope, "headers": [*scope["headers"], (b"authorization", b"Bearer " + pin)]}
        await self.app(scope, receive, send)


# --- login page ---

login_router = APIRouter(prefix="/oauth", include_in_schema=False)

_PAGE = """<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Turnierleitung anmelden</title>
<style>
body{{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;min-height:100vh;
align-items:center;justify-content:center;margin:0;padding:16px}}
main{{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:24px;max-width:360px;width:100%}}
h1{{font-size:1.25rem;margin:0 0 8px}} p{{color:#94a3b8;font-size:.9rem}}
input{{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #334155;
background:#0f172a;color:#fff;font-size:1rem;margin:8px 0}}
button{{width:100%;padding:12px;border:0;border-radius:10px;background:#0ea5e9;color:#fff;font-weight:600;font-size:1rem}}
.error{{color:#fb7185}}
</style></head><body><main>
<h1>🏓 Turnierleitung anmelden</h1>
<p><b>{client}</b> möchte Ergebnisse lesen und eintragen ({host}).</p>
{error}
<form method="post">
<input type="hidden" name="request" value="{request}">
<label for="pin">Admin-PIN</label>
<input id="pin" name="pin" type="password" autocomplete="current-password" autofocus required>
<button type="submit">Zugriff erlauben</button>
</form></main></body></html>"""


def _page(request_id: str, login: PendingLogin, error: str = "") -> HTMLResponse:
    return HTMLResponse(_PAGE.format(
        client=html.escape(login.client.client_name or "Ein MCP-Client"),
        host=html.escape(urlparse(str(login.params.redirect_uri)).hostname or ""),
        request=html.escape(request_id),
        error=f'<p class="error">{html.escape(error)}</p>' if error else "",
    ))


_EXPIRED = HTMLResponse("<p>Anmeldung abgelaufen. Bitte die Verbindung neu starten.</p>", status_code=400)


@login_router.get("/login")
def login_form(request: str):
    login = provider.pending_login(request)
    return _page(request, login) if login else _EXPIRED


@login_router.post("/login")
def login_submit(http: Request, request: str = Form(...), pin: str = Form(...)):
    login = provider.pending_login(request)
    if login is None:
        return _EXPIRED
    client = client_key(http.client.host if http.client else None)
    if wait := pin_attempts.retry_after(client):
        page = _page(request, login, locked_out_message(wait))
        page.status_code = 429
        return page
    redirect = provider.complete_login(request, pin, client)
    if redirect is None:
        if provider.pending_login(request) is None:
            return HTMLResponse("<p>Zu viele Fehlversuche. Bitte die Verbindung neu starten.</p>", status_code=403)
        return _page(request, login, "Falsche Admin-PIN.")
    return RedirectResponse(redirect, status_code=302)
