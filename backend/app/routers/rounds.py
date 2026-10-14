import random
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.auth import require_admin
from backend.app.database import get_db
from backend.app.ko_system import advance_ko_round, generate_ko_phase
from backend.app.models import Round, Team, TeamMatch, Tournament
from backend.app.schemas import RoundResponse
from backend.app.swiss_system import generate_swiss_round_pairings, setup_games_for_match
from backend.app.websocket_hub import ws_manager

router = APIRouter(tags=["Rounds"])


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
    tournament = db.query(Tournament).filter(Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Turnier nicht gefunden")

    # Check active rounds
    active_round = db.query(Round).filter(
        Round.tournament_id == tournament_id,
        Round.is_completed == False
    ).first()

    if active_round:
        raise HTTPException(
            status_code=400, detail=f"Runde {active_round.round_number} ist noch aktiv und nicht abgeschlossen."
        )

    teams_count = db.query(Team).filter(
        Team.tournament_id == tournament_id,
        Team.is_active == True,
        Team.is_bye == False
    ).count()

    if teams_count < 2:
        raise HTTPException(status_code=400, detail="Es werden mindestens 2 Mannschaften benötigt.")

    pairings = generate_swiss_round_pairings(tournament_id, db)
    next_round_number = tournament.current_round_number + 1

    new_round = Round(
        tournament_id=tournament_id,
        round_number=next_round_number,
        round_type="swiss",
        is_completed=False,
        is_active=True
    )
    db.add(new_round)
    db.flush()

    tournament.current_round_number = next_round_number

    table_num = 1
    for t_a_id, t_b_id in pairings:
        team_a = db.get(Team, t_a_id)
        team_b = db.get(Team, t_b_id) if t_b_id else None

        tbl_a = table_num
        tbl_b = (table_num + 1) if (tournament.tables_per_match == 2 and t_b_id is not None) else None
        
        # Advance table counter
        table_num += (2 if (tournament.tables_per_match == 2 and t_b_id is not None) else 1)
        if table_num > tournament.table_count:
            table_num = 1

        match_pin = f"{random.randint(1000, 9999)}"

        # If it's a BYE
        is_bye = (t_b_id is None)
        match = TeamMatch(
            round_id=new_round.id,
            team_a_id=t_a_id,
            team_b_id=t_b_id,
            table_number=None if is_bye else tbl_a,
            table_number_b=None if is_bye else tbl_b,
            match_pin=match_pin,
            team_a_p1_name=team_a.player1_name,
            team_a_p2_name=team_a.player2_name,
            team_b_p1_name=team_b.player1_name if team_b else None,
            team_b_p2_name=team_b.player2_name if team_b else None,
            lineup_confirmed=is_bye,
            score_a=4 if is_bye else 0,
            score_b=0,
            is_completed=is_bye,
            winner_team_id=t_a_id if is_bye else None
        )
        db.add(match)
        db.flush()

        if not is_bye:
            setup_games_for_match(match, tournament.best_of_sets, db)

    db.commit()
    db.refresh(new_round)

    await ws_manager.broadcast({"type": "ROUND_GENERATED", "round_id": new_round.id, "tournament_id": tournament_id})
    return new_round


@router.post(
    "/api/tournaments/{tournament_id}/rounds/start-ko",
    response_model=RoundResponse,
    dependencies=[Depends(require_admin)],
)
async def start_ko_round(tournament_id: int, team_count: int = 4, db: Session = Depends(get_db)):
    try:
        round_obj = generate_ko_phase(tournament_id, team_count, db)
        await ws_manager.broadcast({"type": "KO_STARTED", "tournament_id": tournament_id, "round_id": round_obj.id})
        return round_obj
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post(
    "/api/tournaments/{tournament_id}/rounds/advance-ko",
    response_model=RoundResponse,
    dependencies=[Depends(require_admin)],
)
async def advance_ko(tournament_id: int, db: Session = Depends(get_db)):
    try:
        round_obj = advance_ko_round(tournament_id, db)
        await ws_manager.broadcast({"type": "KO_ADVANCED", "tournament_id": tournament_id, "round_id": round_obj.id})
        return round_obj
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


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
    tournament = m1.round.tournament
    for m in [m1, m2]:
        for g in m.individual_games:
            db.delete(g)
        db.flush()
        if m.team_b_id is not None:
            setup_games_for_match(m, tournament.best_of_sets, db)

    db.commit()
    await ws_manager.broadcast({"type": "ROUND_UPDATED", "round_id": round_id})
    return {"message": "Paarungen erfolgreich getauscht"}


@router.post("/api/rounds/{round_id}/complete", dependencies=[Depends(require_admin)])
async def complete_round(round_id: int, db: Session = Depends(get_db)):
    r = db.query(Round).filter(Round.id == round_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Runde nicht gefunden")

    # Verify if all matches in round are completed
    uncompleted = db.query(TeamMatch).filter(
        TeamMatch.round_id == round_id,
        TeamMatch.is_completed == False
    ).count()

    if uncompleted > 0:
        raise HTTPException(status_code=400, detail=f"Es sind noch {uncompleted} Spiele nicht abgeschlossen.")

    r.is_completed = True
    r.is_active = False
    db.commit()

    await ws_manager.broadcast({"type": "ROUND_COMPLETED", "round_id": round_id, "tournament_id": r.tournament_id})
    return {"message": f"Runde {r.round_number} abgeschlossen"}
