import ipaddress
import math
import secrets
import threading
import time
from collections import deque
from typing import Deque, Dict, Optional

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import Round, TeamMatch, Tournament

ADMIN_PIN_HEADER = "X-Admin-Pin"

MAX_PIN_FAILURES = 10
PIN_FAILURE_WINDOW = 10 * 60
MAX_TRACKED_CLIENTS = 10_000  # beyond that, clients without recent failures are forgotten


def client_key(host: Optional[str]) -> str:
    """Groups addresses the way one attacker holds them: an IPv6 client usually owns a whole /64."""
    try:
        address = ipaddress.ip_address(host or "")
    except ValueError:
        return host or "unknown"
    if address.version == 6:
        if address.ipv4_mapped:
            return str(address.ipv4_mapped)
        return str(ipaddress.ip_network(f"{address}/64", strict=False))
    return str(address)


class FailedPinAttempts:
    """Wrong admin PINs per client, so the PIN can't be guessed by brute force.

    After MAX_PIN_FAILURES within PIN_FAILURE_WINDOW the client is locked out until its
    oldest failure ages out; while locked, the PIN is not checked at all. A correct PIN
    clears the client's failures. In memory: the app runs as one process.
    """

    def __init__(self) -> None:
        self._failures: Dict[str, Deque[float]] = {}
        self._lock = threading.Lock()

    def _recent(self, client: str, now: float) -> Deque[float]:
        failures = self._failures.get(client, deque())
        while failures and failures[0] <= now - PIN_FAILURE_WINDOW:
            failures.popleft()
        return failures

    def retry_after(self, client: str) -> int:
        """Seconds until the client may try again, 0 if it is not locked out."""
        with self._lock:
            now = time.monotonic()
            failures = self._recent(client, now)
            if len(failures) < MAX_PIN_FAILURES:
                return 0
            return max(1, math.ceil(failures[0] + PIN_FAILURE_WINDOW - now))

    def record_failure(self, client: str) -> None:
        with self._lock:
            now = time.monotonic()
            self._failures[client] = failures = self._recent(client, now)
            failures.append(now)
            if len(self._failures) > MAX_TRACKED_CLIENTS:
                for key in [k for k in self._failures if not self._recent(k, now)]:
                    del self._failures[key]

    def clear(self, client: Optional[str] = None) -> None:
        with self._lock:
            if client is None:
                self._failures.clear()
            else:
                self._failures.pop(client, None)


pin_attempts = FailedPinAttempts()


def locked_out_message(retry_after: int) -> str:
    minutes = math.ceil(retry_after / 60)
    return f"Zu viele falsche Admin-PINs. Bitte in {minutes} Minute{'n' if minutes != 1 else ''} erneut versuchen."


def active_tournament(db: Session) -> Optional[Tournament]:
    return db.query(Tournament).filter(Tournament.is_active == True).order_by(Tournament.id.desc()).first()


def _tournament_for_request(request: Request, db: Session) -> Optional[Tournament]:
    """Finds the tournament an admin request acts on, from its path parameters."""
    params = request.path_params
    if "tournament_id" in params:
        return db.get(Tournament, int(params["tournament_id"]))
    if "round_id" in params:
        round_obj = db.get(Round, int(params["round_id"]))
        return round_obj.tournament if round_obj else None
    if "match_id" in params:
        match = db.get(TeamMatch, int(params["match_id"]))
        return match.round.tournament if match else None
    # Creating a tournament replaces the active one, so its PIN guards the call.
    return active_tournament(db)


def check_admin_pin(tournament: Optional[Tournament], pin: Optional[str], client: Optional[str] = None) -> None:
    """Raises 401/403 unless pin is the tournament's admin PIN. No tournament: nothing to protect.

    With a client key, wrong PINs count towards that client's lockout (429).
    """
    if tournament is None:
        return
    if not pin:
        raise HTTPException(status_code=401, detail="Admin-PIN erforderlich.")
    if client is not None and (wait := pin_attempts.retry_after(client)):
        raise HTTPException(status_code=429, detail=locked_out_message(wait), headers={"Retry-After": str(wait)})
    if not secrets.compare_digest(pin.strip().encode(), tournament.admin_pin.encode()):
        if client is not None:
            pin_attempts.record_failure(client)
        raise HTTPException(status_code=403, detail="Falsche Admin-PIN.")
    if client is not None:
        pin_attempts.clear(client)


def require_admin(
    request: Request,
    x_admin_pin: Optional[str] = Header(None, alias=ADMIN_PIN_HEADER),
    db: Session = Depends(get_db),
) -> None:
    """Rejects the request unless the X-Admin-Pin header matches the tournament's admin PIN."""
    # Without a tournament the endpoint itself answers with 404 where needed.
    client = client_key(request.client.host if request.client else None)
    check_admin_pin(_tournament_for_request(request, db), x_admin_pin, client)
