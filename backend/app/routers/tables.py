from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import Round, Table, TeamMatch, Tournament
from backend.app.schemas import TableStatusResponse

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
    tables = db.query(Table).filter(Table.tournament_id == tournament_id).order_by(Table.table_number.asc()).all()

    # Find active rounds
    active_matches = db.query(TeamMatch).join(Round).filter(
        Round.tournament_id == tournament_id,
        Round.is_active == True,
        TeamMatch.is_completed == False,
        TeamMatch.team_b_id.isnot(None)
    ).all()

    # Map tables
    match_by_table = {}
    for m in active_matches:
        if m.table_number:
            match_by_table[m.table_number] = m
        if m.table_number_b:
            match_by_table[m.table_number_b] = m

    response = []
    for t in tables:
        match = match_by_table.get(t.table_number)
        if not match:
            response.append(TableStatusResponse(
                table_number=t.table_number,
                pin_code=t.pin_code,
                current_team_match_id=None,
                is_active=False
            ))
            continue

        # Find active individual game on this table
        active_game = None
        for g in match.individual_games:
            # If 2 tables assigned, match table_number
            if g.table_number == t.table_number and not g.is_completed:
                active_game = g
                break
            elif not g.is_completed and active_game is None:
                active_game = g

        game_desc = ""
        if active_game:
            label = "Doppel" if active_game.is_doubles else f"Einzel {active_game.game_order}"
            game_desc = f"{label}: {active_game.player_a_name or 'A'} vs {active_game.player_b_name or 'B'}"

        response.append(TableStatusResponse(
            table_number=t.table_number,
            pin_code=t.pin_code,
            current_team_match_id=match.id,
            team_a_name=match.team_a.name if match.team_a else "Team A",
            team_b_name=match.team_b.name if match.team_b else "Team B",
            active_game_desc=game_desc,
            match_score_a=match.score_a or 0,
            match_score_b=match.score_b or 0,
            is_active=True
        ))

    return response


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
