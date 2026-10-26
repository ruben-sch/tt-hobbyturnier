from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import Round, Table, TeamMatch, Tournament
from backend.app.schemas import TableStatusResponse
from backend.app.table_status import tables_status

router = APIRouter(prefix="/api/tables", tags=["Tables"])


class PinAuthRequest(BaseModel):
    pin: str
    table_number: Optional[int] = None


class PinAuthResponse(BaseModel):
    authenticated: bool
    role: str  # "admin", "table", "match"
    table_number: Optional[int] = None
    match_id: Optional[int] = None
    message: str


@router.get("/status/{tournament_id}", response_model=List[TableStatusResponse])
def get_tables_status(tournament_id: int, db: Session = Depends(get_db)):
    return tables_status(tournament_id, db)


@router.post("/auth/{tournament_id}", response_model=PinAuthResponse)
def authenticate_pin(tournament_id: int, payload: PinAuthRequest, db: Session = Depends(get_db)):
    t = db.query(Tournament).filter(Tournament.id == tournament_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Turnier nicht gefunden")

    clean_pin = payload.pin.strip()

    # 1. Admin PIN
    if clean_pin == t.admin_pin:
        return PinAuthResponse(
            authenticated=True,
            role="admin",
            table_number=None,
            match_id=None,
            message="Erfolgreich als Turnierleitung angemeldet."
        )

    # 2. Table PIN
    table = db.query(Table).filter(
        Table.tournament_id == tournament_id,
        Table.pin_code == clean_pin
    ).first()

    if table:
        # Find active match on this table
        active_match = db.query(TeamMatch).join(Round).filter(
            Round.tournament_id == tournament_id,
            Round.is_active == True,
            TeamMatch.is_completed == False,
            (TeamMatch.table_number == table.table_number) | (TeamMatch.table_number_b == table.table_number)
        ).first()

        return PinAuthResponse(
            authenticated=True,
            role="table",
            table_number=table.table_number,
            match_id=active_match.id if active_match else None,
            message=f"Tisch {table.table_number} authentifiziert."
        )

    # 3. Match PIN
    match = db.query(TeamMatch).join(Round).filter(
        Round.tournament_id == tournament_id,
        TeamMatch.match_pin == clean_pin
    ).first()

    if match:
        return PinAuthResponse(
            authenticated=True,
            role="match",
            table_number=match.table_number,
            match_id=match.id,
            message=f"Begegnung {match.team_a.name} vs {match.team_b.name if match.team_b else 'BYE'} autorisiert."
        )

    return PinAuthResponse(
        authenticated=False,
        role="none",
        message="Ungültige PIN. Bitte prüfe die Tisch-PIN oder frage die Turnierleitung."
    )
