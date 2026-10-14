import secrets
from typing import Optional

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import Round, Tournament

ADMIN_PIN_HEADER = "X-Admin-Pin"


def _tournament_for_request(request: Request, db: Session) -> Optional[Tournament]:
    """Finds the tournament an admin request acts on, from its path parameters."""
    params = request.path_params
    if "tournament_id" in params:
        return db.get(Tournament, int(params["tournament_id"]))
    if "round_id" in params:
        round_obj = db.get(Round, int(params["round_id"]))
        return round_obj.tournament if round_obj else None
    # Creating a tournament replaces the active one, so its PIN guards the call.
    return db.query(Tournament).filter(Tournament.is_active == True).order_by(Tournament.id.desc()).first()


def require_admin(
    request: Request,
    x_admin_pin: Optional[str] = Header(None, alias=ADMIN_PIN_HEADER),
    db: Session = Depends(get_db),
) -> None:
    """Rejects the request unless the X-Admin-Pin header matches the tournament's admin PIN."""
    tournament = _tournament_for_request(request, db)
    if tournament is None:
        # Nothing to protect yet; the endpoint itself answers with 404 where needed.
        return
    if not x_admin_pin:
        raise HTTPException(status_code=401, detail="Admin-PIN erforderlich.")
    if not secrets.compare_digest(x_admin_pin.strip().encode(), tournament.admin_pin.encode()):
        raise HTTPException(status_code=403, detail="Falsche Admin-PIN.")
