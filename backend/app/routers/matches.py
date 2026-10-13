from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import IndividualGame, SetScore, TeamMatch
from backend.app.schemas import (
    IndividualGameResponse,
    LineupUpdate,
    PointUpdate,
    QuickGameResult,
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
    Evaluates completed individual games and checks if team match is finished.
    In KO: First to 3 wins terminates immediately; 2:2 triggers deciding doubles.
    In Swiss: All 4 games played, result can be 4:0, 3:1, 2:2.
    """
    round_obj = match.round
    tournament = round_obj.tournament
    games = sorted(match.individual_games, key=lambda g: g.game_order)

    wins_a = sum(1 for g in games if g.is_completed and g.winner_team_side == "A")
    wins_b = sum(1 for g in games if g.is_completed and g.winner_team_side == "B")
    match.score_a = wins_a
    match.score_b = wins_b

    is_ko = (round_obj.round_type == "ko")

    if is_ko:
        # KO Phase: first to 3 wins
        if wins_a >= 3:
            match.is_completed = True
            match.winner_team_id = match.team_a_id
        elif wins_b >= 3:
            match.is_completed = True
            match.winner_team_id = match.team_b_id
        elif wins_a == 2 and wins_b == 2:
            # Add deciding doubles if not exists
            has_doubles = any(g.is_doubles for g in games)
            if not has_doubles:
                add_deciding_doubles_game(match, tournament.best_of_sets, db)
    else:
        # Swiss round: 4 games total
        all_completed = len(games) >= 4 and all(g.is_completed for g in games[:4])
        if all_completed:
            match.is_completed = True
            if wins_a > wins_b:
                match.winner_team_id = match.team_a_id
            elif wins_b > wins_a:
                match.winner_team_id = match.team_b_id
            else:
                match.winner_team_id = None  # Draw


@router.post("/{match_id}/games/{game_id}/point", response_model=IndividualGameResponse)
async def update_point(
    match_id: int,
    game_id: int,
    payload: PointUpdate,
    db: Session = Depends(get_db)
):
    match = db.query(TeamMatch).filter(TeamMatch.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Begegnung nicht gefunden")

    game = db.query(IndividualGame).filter(
        IndividualGame.id == game_id,
        IndividualGame.team_match_id == match_id
    ).first()
    if not game:
        raise HTTPException(status_code=404, detail="Einzelspiel nicht gefunden")

    tournament = match.round.tournament
    pts_to_win = tournament.points_per_set
    sets_needed = 3 if tournament.best_of_sets == 5 else 2

    game.current_point_a = max(0, payload.point_a)
    game.current_point_b = max(0, payload.point_b)
    game.current_set_index = payload.set_number

    # Check if this set is won (e.g. 11:9, or 12:10)
    p_a = game.current_point_a
    p_b = game.current_point_b
    set_won_a = (p_a >= pts_to_win and (p_a - p_b) >= 2)
    set_won_b = (p_b >= pts_to_win and (p_b - p_a) >= 2)

    # Get or create SetScore for current set
    set_obj = db.query(SetScore).filter(
        SetScore.individual_game_id == game.id,
        SetScore.set_number == payload.set_number
    ).first()

    if not set_obj:
        set_obj = SetScore(
            individual_game_id=game.id,
            set_number=payload.set_number,
            score_a=p_a,
            score_b=p_b,
            is_completed=False
        )
        db.add(set_obj)

    set_obj.score_a = p_a
    set_obj.score_b = p_b

    if set_won_a or set_won_b:
        set_obj.is_completed = True
        if set_won_a:
            game.sets_won_a += 1
        else:
            game.sets_won_b += 1

        # Check if game is completed
        if game.sets_won_a >= sets_needed or game.sets_won_b >= sets_needed:
            game.is_completed = True
            game.winner_team_side = "A" if game.sets_won_a > game.sets_won_b else "B"
            check_and_update_match_status(match, db)
        else:
            # Advance to next set
            game.current_set_index += 1
            game.current_point_a = 0
            game.current_point_b = 0

    db.commit()
    db.refresh(game)
    db.refresh(match)

    # Broadcast live score update via WebSocket
    await ws_manager.broadcast({
        "type": "SCORE_UPDATE",
        "match_id": match.id,
        "game_id": game.id,
        "table_number": game.table_number or match.table_number,
        "game_order": game.game_order,
        "point_a": game.current_point_a,
        "point_b": game.current_point_b,
        "sets_won_a": game.sets_won_a,
        "sets_won_b": game.sets_won_b,
        "current_set": game.current_set_index,
        "is_game_completed": game.is_completed,
        "match_score_a": match.score_a,
        "match_score_b": match.score_b,
        "is_match_completed": match.is_completed
    })

    return game


@router.post("/{match_id}/games/{game_id}/quick-result", response_model=IndividualGameResponse)
async def set_quick_result(
    match_id: int,
    game_id: int,
    payload: QuickGameResult,
    db: Session = Depends(get_db)
):
    """
    Directly records finished set scores (e.g. [11-9, 7-11, 11-8, 11-6]).
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

    tournament = match.round.tournament
    sets_needed = 3 if tournament.best_of_sets == 5 else 2

    # Clear old set scores
    db.query(SetScore).filter(SetScore.individual_game_id == game.id).delete()
    db.flush()

    sets_a = 0
    sets_b = 0

    for s in payload.sets:
        is_completed = (s.score_a >= 11 or s.score_b >= 11) and abs(s.score_a - s.score_b) >= 2
        set_obj = SetScore(
            individual_game_id=game.id,
            set_number=s.set_number,
            score_a=s.score_a,
            score_b=s.score_b,
            is_completed=is_completed
        )
        db.add(set_obj)
        if s.score_a > s.score_b:
            sets_a += 1
        elif s.score_b > s.score_a:
            sets_b += 1

    game.sets_won_a = sets_a
    game.sets_won_b = sets_b
    game.current_point_a = 0
    game.current_point_b = 0

    if sets_a >= sets_needed or sets_b >= sets_needed:
        game.is_completed = True
        game.winner_team_side = "A" if sets_a > sets_b else "B"
    else:
        game.is_completed = False
        game.winner_team_side = None

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
