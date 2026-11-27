"""What is being played right now, for the Hallen-Monitor, the result entry and MCP.

There are no tables: a match plays its games in game order, so its running game is
its first open one.
"""
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from backend.app.auth import running_tournaments
from backend.app.models import IndividualGame, Round, TeamMatch


def _game_desc(game: Optional[IndividualGame]) -> str:
    if game is None:
        return ""
    label = "Doppel" if game.is_doubles else f"Einzel {game.game_order}"
    return f"{label}: {game.player_a_name or 'A'} vs {game.player_b_name or 'B'}"


def running_game(match: TeamMatch) -> Optional[IndividualGame]:
    """The game the match plays now: its first open game, None once the match is over."""
    if match.is_completed:
        return None
    return next((g for g in sorted(match.individual_games, key=lambda g: g.game_order) if not g.is_completed), None)


def _games(match: TeamMatch) -> List[Dict[str, Any]]:
    running = running_game(match)
    return [{
        "game_order": g.game_order,
        "is_doubles": bool(g.is_doubles),
        "player_a_name": g.player_a_name,
        "player_b_name": g.player_b_name,
        "sets_a": g.sets_won_a or 0,
        "sets_b": g.sets_won_b or 0,
        "is_completed": bool(g.is_completed),
        "is_running": running is not None and g.id == running.id,
    } for g in sorted(match.individual_games, key=lambda g: g.game_order)]


def _active_round_matches(db: Session, tournament_ids: List[int]) -> List[TeamMatch]:
    """Every match of the open round of these tournaments (byes left out), in a stable order."""
    if not tournament_ids:
        return []
    return db.query(TeamMatch).join(Round).filter(
        Round.tournament_id.in_(tournament_ids),
        Round.is_active == True,
        TeamMatch.team_b_id.isnot(None),
    ).order_by(Round.tournament_id, TeamMatch.id).all()


def _summary(m: TeamMatch) -> Dict[str, Any]:
    return {
        "match_id": m.id,
        "team_a_name": m.team_a.name if m.team_a else "Team A",
        "team_b_name": m.team_b.name if m.team_b else "Team B",
        "score_a": m.score_a or 0,
        "score_b": m.score_b or 0,
        "is_completed": bool(m.is_completed),
        "active_game_desc": _game_desc(running_game(m)),
    }


def round_matches(tournament_id: int, db: Session) -> List[Dict[str, Any]]:
    """The open round of one tournament for the Hallen-Monitor, finished matches included, with their games."""
    return [{**_summary(m), "games": _games(m)} for m in _active_round_matches(db, [tournament_id])]


def live_matches(db: Session) -> List[Dict[str, Any]]:
    """The open rounds of every running tournament, mixed, for result entry: each match labelled with its class."""
    tournaments = {t.id: t for t in running_tournaments(db)}
    result = []
    for m in _active_round_matches(db, list(tournaments)):
        t = tournaments[m.round.tournament_id]
        result.append({
            **_summary(m),
            "tournament_id": t.id,
            "tournament_name": t.name,
            "best_of_sets": t.best_of_sets,
            "round_number": m.round.round_number,
            "ko_stage": m.round.ko_stage,
        })
    return result
