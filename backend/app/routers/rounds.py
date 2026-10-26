from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app import progression
from backend.app.auth import require_admin
from backend.app.database import get_db
from backend.app.match_sheet import create_games
from backend.app.models import Round, Team, TeamMatch, Tournament
from backend.app.schemas import RoundResponse
from backend.app.websocket_hub import ws_manager

router = APIRouter(tags=["Rounds"])


def _tournament(tournament_id: int, db: Session) -> Tournament:
    tournament = db.get(Tournament, tournament_id)
    if not tournament:
        raise HTTPException(status_code=404, detail="Turnier nicht gefunden")
    return tournament


def _progress(step, tournament: Tournament, db: Session, *args) -> Round:
    """Runs a progression step and commits it; its ValueErrors become 400s."""
    try:
        new_round = step(tournament, *args, db=db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    db.commit()
    db.refresh(new_round)
    return new_round


class SwapPairingsRequest(BaseModel):
    match_id_1: int
    match_id_2: int
    swap_team_b_only: bool = True


@router.get("/api/tournaments/{tournament_id}/rounds", response_model=List[RoundResponse])
def get_rounds(tournament_id: int, db: Session = Depends(get_db)):
    return db.query(Round).filter(
        Round.tournament_id == tournament_id
    ).order_by(Round.round_number.asc()).all()


@router.post(
    "/api/tournaments/{tournament_id}/rounds/next-swiss",
    response_model=RoundResponse,
    dependencies=[Depends(require_admin)],
)
async def create_next_swiss_round(tournament_id: int, db: Session = Depends(get_db)):
    new_round = _progress(progression.next_swiss_round, _tournament(tournament_id, db), db)
    await ws_manager.broadcast({"type": "ROUND_GENERATED", "round_id": new_round.id, "tournament_id": tournament_id})
    return new_round


@router.post(
    "/api/tournaments/{tournament_id}/rounds/start-ko",
    response_model=RoundResponse,
    dependencies=[Depends(require_admin)],
)
async def start_ko_round(tournament_id: int, team_count: int = 4, db: Session = Depends(get_db)):
    round_obj = _progress(progression.start_ko, _tournament(tournament_id, db), db, team_count)
    await ws_manager.broadcast({"type": "KO_STARTED", "tournament_id": tournament_id, "round_id": round_obj.id})
    return round_obj


@router.post(
    "/api/tournaments/{tournament_id}/rounds/advance-ko",
    response_model=RoundResponse,
    dependencies=[Depends(require_admin)],
)
async def advance_ko(tournament_id: int, db: Session = Depends(get_db)):
    round_obj = _progress(progression.advance_ko, _tournament(tournament_id, db), db)
    await ws_manager.broadcast({"type": "KO_ADVANCED", "tournament_id": tournament_id, "round_id": round_obj.id})
    return round_obj


@router.post("/api/rounds/{round_id}/swap-pairings", dependencies=[Depends(require_admin)])
async def swap_pairings(round_id: int, payload: SwapPairingsRequest, db: Session = Depends(get_db)):
    m1 = db.query(TeamMatch).filter(TeamMatch.id == payload.match_id_1, TeamMatch.round_id == round_id).first()
    m2 = db.query(TeamMatch).filter(TeamMatch.id == payload.match_id_2, TeamMatch.round_id == round_id).first()

    if not m1 or not m2:
        raise HTTPException(status_code=404, detail="Begegnung(en) nicht gefunden")

    if m1.lineup_confirmed or m2.lineup_confirmed or m1.is_completed or m2.is_completed:
        raise HTTPException(
            status_code=400, detail="Aufstellung oder Spiel bereits begonnen; Tausch nicht mehr möglich."
        )

    # Swap team B
    m1_b_id = m1.team_b_id
    m2_b_id = m2.team_b_id

    m1.team_b_id = m2_b_id
    m2.team_b_id = m1_b_id

    # Update player names
    t_b1 = db.get(Team, m1.team_b_id) if m1.team_b_id else None
    t_b2 = db.get(Team, m2.team_b_id) if m2.team_b_id else None

    m1.team_b_p1_name = t_b1.player1_name if t_b1 else None
    m1.team_b_p2_name = t_b1.player2_name if t_b1 else None
    m2.team_b_p1_name = t_b2.player1_name if t_b2 else None
    m2.team_b_p2_name = t_b2.player2_name if t_b2 else None

    # Re-setup games
    for m in [m1, m2]:
        for g in m.individual_games:
            db.delete(g)
        db.flush()
        if m.team_b_id is not None:
            create_games(m, db)

    db.commit()
    await ws_manager.broadcast({"type": "ROUND_UPDATED", "round_id": round_id})
    return {"message": "Paarungen erfolgreich getauscht"}


@router.post("/api/rounds/{round_id}/complete", dependencies=[Depends(require_admin)])
async def complete_round(round_id: int, db: Session = Depends(get_db)):
    r = db.query(Round).filter(Round.id == round_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Runde nicht gefunden")

    try:
        progression.complete_round(r)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    db.commit()

    await ws_manager.broadcast({"type": "ROUND_COMPLETED", "round_id": round_id, "tournament_id": r.tournament_id})
    return {"message": f"Runde {r.round_number} abgeschlossen"}
