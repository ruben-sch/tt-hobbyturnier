from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app import match_rules
from backend.app.database import get_db
from backend.app.match_sheet import add_deciding_doubles, apply_lineup
from backend.app.models import IndividualGame, TeamMatch
from backend.app.schemas import (
    GameResultUpdate,
    IndividualGameResponse,
    LineupUpdate,
    TeamMatchResponse,
)
from backend.app.websocket_hub import ws_manager

router = APIRouter(prefix="/api/matches", tags=["Matches"])


@router.get("/{match_id}", response_model=TeamMatchResponse)
def get_match(match_id: int, db: Session = Depends(get_db)):
    match = db.query(TeamMatch).filter(TeamMatch.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Begegnung nicht gefunden")
    return match


@router.post("/{match_id}/lineup", response_model=TeamMatchResponse)
async def set_lineup(match_id: int, payload: LineupUpdate, db: Session = Depends(get_db)):
    match = db.query(TeamMatch).filter(TeamMatch.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Begegnung nicht gefunden")

    apply_lineup(match, payload.team_a_p1_name, payload.team_a_p2_name,
                 payload.team_b_p1_name, payload.team_b_p2_name)

    db.commit()
    db.refresh(match)

    await ws_manager.broadcast({
        "type": "LINEUP_CONFIRMED",
        "match_id": match.id,
        "round_id": match.round_id,
        "table_number": match.table_number
    })
    return match


def check_and_update_match_status(match: TeamMatch, db: Session):
    """Applies match_rules.match_result to the match, adding or dropping the deciding doubles."""
    result = match_rules.match_result(match.round.round_type, match.individual_games)
    if result.needs_doubles:
        add_deciding_doubles(match, db)
    if result.drop_doubles:
        doubles = next(g for g in match.individual_games if g.is_doubles)
        match.individual_games.remove(doubles)
        db.delete(doubles)

    match.score_a, match.score_b = result.score_a, result.score_b
    match.is_completed = result.is_completed
    match.winner_team_id = {"A": match.team_a_id, "B": match.team_b_id}.get(result.winner_side)


@router.post("/{match_id}/games/{game_id}/result", response_model=IndividualGameResponse)
async def set_game_result(
    match_id: int,
    game_id: int,
    payload: GameResultUpdate,
    db: Session = Depends(get_db)
):
    """
    Records the final set count of a single (e.g. 3:1). 0:0 resets the game to open.
    """
    match = db.query(TeamMatch).filter(TeamMatch.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Begegnung nicht gefunden")

    game = db.query(IndividualGame).filter(
        IndividualGame.id == game_id,
        IndividualGame.team_match_id == match_id
    ).first()
    if not game:
        raise HTTPException(status_code=404, detail="Einzelspiel nicht gefunden")

    try:
        result = match_rules.game_result(payload.sets_a, payload.sets_b, match.round.tournament.best_of_sets)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    game.sets_won_a, game.sets_won_b = result.sets_a, result.sets_b
    game.is_completed = result.is_completed
    game.winner_team_side = result.winner_side

    check_and_update_match_status(match, db)

    db.commit()
    db.refresh(game)
    db.refresh(match)

    await ws_manager.broadcast({
        "type": "SCORE_UPDATE",
        "match_id": match.id,
        "game_id": game.id,
        "table_number": game.table_number or match.table_number,
        "sets_won_a": game.sets_won_a,
        "sets_won_b": game.sets_won_b,
        "is_game_completed": game.is_completed,
        "match_score_a": match.score_a,
        "match_score_b": match.score_b,
        "is_match_completed": match.is_completed
    })

    return game
