from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from backend.app.models import IndividualGame, Round, TeamMatch, Tournament
from backend.app.schemas import TableStatusResponse


def _game_desc(game: Optional[IndividualGame]) -> str:
    if game is None:
        return ""
    label = "Doppel" if game.is_doubles else f"Einzel {game.game_order}"
    return f"{label}: {game.player_a_name or 'A'} vs {game.player_b_name or 'B'}"


def tables_status(tournament_id: int, db: Session) -> List[TableStatusResponse]:
    """What each table is playing right now: the open match of the active round and its next game."""
    tournament = db.get(Tournament, tournament_id)
    if tournament is None:
        return []

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
    for table_number in range(1, tournament.table_count + 1):
        match = match_by_table.get(table_number)
        if not match:
            response.append(TableStatusResponse(
                table_number=table_number,
                current_team_match_id=None,
                is_active=False
            ))
            continue

        # Find active individual game on this table
        active_game = None
        for g in match.individual_games:
            # If 2 tables assigned, match table_number
            if g.table_number == table_number and not g.is_completed:
                active_game = g
                break
            elif not g.is_completed and active_game is None:
                active_game = g

        game_desc = _game_desc(active_game)

        response.append(TableStatusResponse(
            table_number=table_number,
            current_team_match_id=match.id,
            team_a_name=match.team_a.name if match.team_a else "Team A",
            team_b_name=match.team_b.name if match.team_b else "Team B",
            active_game_desc=game_desc,
            match_score_a=match.score_a or 0,
            match_score_b=match.score_b or 0,
            is_active=True
        ))

    return response


def _running_game_ids(match: TeamMatch) -> set:
    """The game each table of the match plays now: its first open game. Games run in game order per table."""
    running = {}
    for g in sorted(match.individual_games, key=lambda g: g.game_order):
        if not g.is_completed and g.table_number not in running:
            running[g.table_number] = g.id
    return set(running.values())


def _games(match: TeamMatch) -> List[Dict[str, Any]]:
    running = set() if match.is_completed else _running_game_ids(match)
    return [{
        "game_order": g.game_order,
        "is_doubles": bool(g.is_doubles),
        "player_a_name": g.player_a_name,
        "player_b_name": g.player_b_name,
        "table_number": g.table_number,
        "sets_a": g.sets_won_a or 0,
        "sets_b": g.sets_won_b or 0,
        "is_completed": bool(g.is_completed),
        "is_running": g.id in running,
    } for g in sorted(match.individual_games, key=lambda g: g.game_order)]


def round_matches(tournament_id: int, db: Session) -> List[Dict[str, Any]]:
    """Every match of the active round (byes left out), finished ones included, in a stable order."""
    matches = db.query(TeamMatch).join(Round).filter(
        Round.tournament_id == tournament_id,
        Round.is_active == True,
        TeamMatch.team_b_id.isnot(None)
    ).order_by(TeamMatch.id).all()

    return [{
        "match_id": m.id,
        "team_a_name": m.team_a.name if m.team_a else "Team A",
        "team_b_name": m.team_b.name if m.team_b else "Team B",
        "table_number": m.table_number,
        "table_number_b": m.table_number_b,
        "score_a": m.score_a or 0,
        "score_b": m.score_b or 0,
        "is_completed": bool(m.is_completed),
        "active_game_desc": "" if m.is_completed else _game_desc(
            next((g for g in m.individual_games if not g.is_completed), None)),
        "games": _games(m),
    } for m in matches]
