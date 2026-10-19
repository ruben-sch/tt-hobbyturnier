from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import IndividualGame, TeamMatch
from backend.app.schemas import (
    GameResultUpdate,
    IndividualGameResponse,
    LineupUpdate,
    TeamMatchResponse,
)
from backend.app.swiss_system import add_deciding_doubles_game
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

    match.team_a_p1_name = payload.team_a_p1_name
    match.team_a_p2_name = payload.team_a_p2_name
    match.team_b_p1_name = payload.team_b_p1_name
    match.team_b_p2_name = payload.team_b_p2_name
    match.lineup_confirmed = True

    # Update individual games player names
    # 1: A1 vs B2, 2: A2 vs B1, 3: A1 vs B1, 4: A2 vs B2
    for g in match.individual_games:
        if g.game_order == 1:
            g.player_a_name = payload.team_a_p1_name
            g.player_b_name = payload.team_b_p2_name
        elif g.game_order == 2:
            g.player_a_name = payload.team_a_p2_name
            g.player_b_name = payload.team_b_p1_name
        elif g.game_order == 3:
            g.player_a_name = payload.team_a_p1_name
            g.player_b_name = payload.team_b_p1_name
        elif g.game_order == 4:
            g.player_a_name = payload.team_a_p2_name
            g.player_b_name = payload.team_b_p2_name

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
    """
    Recomputes score, completion and winner of a team match from its games, so
    corrections (including resetting a game) are reflected both ways.
    In KO: first to 3 wins ends the match; 2:2 after the singles adds the deciding doubles.
    In Swiss: all 4 singles are played, result can be 4:0, 3:1, 2:2.
    """
    round_obj = match.round
    games = sorted(match.individual_games, key=lambda g: g.game_order)

    wins_a = sum(1 for g in games if g.is_completed and g.winner_team_side == "A")
    wins_b = sum(1 for g in games if g.is_completed and g.winner_team_side == "B")
    match.score_a = wins_a
    match.score_b = wins_b
    match.is_completed = False
    match.winner_team_id = None

    if round_obj.round_type == "ko":
        singles = [g for g in games if not g.is_doubles]
        singles_a = sum(1 for g in singles if g.is_completed and g.winner_team_side == "A")
        singles_b = sum(1 for g in singles if g.is_completed and g.winner_team_side == "B")
        doubles = next((g for g in games if g.is_doubles), None)

        if singles_a == 2 and singles_b == 2:
            if doubles is None:
                add_deciding_doubles_game(match, db)
        elif doubles is not None:
            # A corrected single broke the 2:2, so the deciding doubles no longer counts
            if doubles.is_completed:
                if doubles.winner_team_side == "A":
                    wins_a -= 1
                else:
                    wins_b -= 1
                match.score_a = wins_a
                match.score_b = wins_b
            match.individual_games.remove(doubles)
            db.delete(doubles)

        if wins_a >= 3:
            match.is_completed = True
            match.winner_team_id = match.team_a_id
        elif wins_b >= 3:
            match.is_completed = True
            match.winner_team_id = match.team_b_id
    else:
        all_completed = len(games) >= 4 and all(g.is_completed for g in games[:4])
        if all_completed:
            match.is_completed = True
            if wins_a > wins_b:
                match.winner_team_id = match.team_a_id
            elif wins_b > wins_a:
                match.winner_team_id = match.team_b_id
            # else: draw, winner stays None


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

    sets_needed = 3 if match.round.tournament.best_of_sets == 5 else 2
    a, b = payload.sets_a, payload.sets_b

    if a == 0 and b == 0:
        game.sets_won_a = 0
        game.sets_won_b = 0
        game.is_completed = False
        game.winner_team_side = None
    elif min(a, b) >= 0 and max(a, b) == sets_needed and min(a, b) < sets_needed:
        game.sets_won_a = a
        game.sets_won_b = b
        game.is_completed = True
        game.winner_team_side = "A" if a > b else "B"
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Ungültiges Ergebnis {a}:{b}. Gespielt wird auf {sets_needed} Gewinnsätze."
        )

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
