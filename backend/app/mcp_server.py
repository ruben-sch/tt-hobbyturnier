"""MCP server (Streamable HTTP under /mcp) for AI assistants: read results and standings, enter results.

Every request needs the Turnierleitung's authorization (see mcp_auth): an OAuth token
(claude.ai) or the admin PIN as `Authorization: Bearer <PIN>` / `X-Admin-Pin` header.
"""

from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from sqlalchemy.orm import Session

from backend.app.auth import active_tournament
from backend.app.database import SessionLocal
from backend.app.mcp_auth import auth_settings, provider
from backend.app.models import Round, TeamMatch, Tournament
from backend.app.routers import matches
from backend.app.schemas import GameResultUpdate
from backend.app.swiss_system import calculate_standings
from backend.app.table_status import tables_status

mcp = MCPServer(
    name="tt-hobbyturnier",
    instructions=(
        "Tischtennis-Hobbyturnier mit 2er-Teams. Eine Begegnung (match) besteht aus 4 Einzeln, "
        "in der KO-Phase bei 2:2 plus Doppel. Pro Spiel wird nur der Satzstand (z.B. 3:1) eingetragen, "
        "Satz- oder Ballstände gibt es nicht."
    ),
    auth=auth_settings,
    auth_server_provider=provider,
)


def _tournament(db: Session) -> Tournament:
    tournament = active_tournament(db)
    if tournament is None:
        raise ToolError("Kein aktives Turnier.")
    return tournament


def _game(g) -> Dict[str, Any]:
    return {
        "game_id": g.id,
        "game": "Doppel" if g.is_doubles else f"Einzel {g.game_order}",
        "player_a": g.player_a_name,
        "player_b": g.player_b_name,
        "table_number": g.table_number,
        "sets": f"{g.sets_won_a}:{g.sets_won_b}" if g.is_completed else None,
    }


def _match(m: TeamMatch) -> Dict[str, Any]:
    return {
        "match_id": m.id,
        "team_a": m.team_a.name,
        "team_b": m.team_b.name if m.team_b else None,
        "tables": [t for t in (m.table_number, m.table_number_b) if t],
        "score": f"{m.score_a}:{m.score_b}",
        "is_completed": m.is_completed,
        "games": [_game(g) for g in sorted(m.individual_games, key=lambda g: g.game_order)],
    }


def _round(r: Round) -> Dict[str, Any]:
    return {
        "round_number": r.round_number,
        "round_type": r.round_type,
        "ko_stage": r.ko_stage,
        "is_active": r.is_active,
        "is_completed": r.is_completed,
        "matches": [_match(m) for m in r.team_matches],
    }


@mcp.tool()
def get_tournament() -> Dict[str, Any]:
    """Active tournament: name, settings and an overview of all rounds."""
    with SessionLocal() as db:
        t = _tournament(db)
        rounds = db.query(Round).filter(Round.tournament_id == t.id).order_by(Round.round_number).all()
        return {
            "name": t.name,
            "swiss_rounds_count": t.swiss_rounds_count,
            "ko_enabled": t.ko_enabled,
            "best_of_sets": t.best_of_sets,
            "table_count": t.table_count,
            "current_round_number": t.current_round_number,
            "rounds": [
                {k: v for k, v in _round(r).items() if k != "matches"} for r in rounds
            ],
        }


@mcp.tool()
def get_standings() -> List[Dict[str, Any]]:
    """Current standings (Tabelle) of the active tournament, best team first."""
    with SessionLocal() as db:
        return calculate_standings(_tournament(db).id, db)


@mcp.tool()
def get_round(round_number: Optional[int] = None) -> Dict[str, Any]:
    """All matches of a round with their games, set counts and the match/game ids needed to enter results.

    Without round_number: the active round, or the last one if none is active.
    """
    with SessionLocal() as db:
        t = _tournament(db)
        query = db.query(Round).filter(Round.tournament_id == t.id)
        if round_number is not None:
            r = query.filter(Round.round_number == round_number).first()
        else:
            r = query.order_by(Round.is_active.desc(), Round.round_number.desc()).first()
        if r is None:
            raise ToolError("Runde nicht gefunden.")
        return _round(r)


@mcp.tool()
def get_live_status() -> Dict[str, Any]:
    """What is being played right now: per table the running match, its next open game and the match score."""
    with SessionLocal() as db:
        t = _tournament(db)
        active = db.query(Round).filter(Round.tournament_id == t.id, Round.is_active == True).first()
        return {
            "round_number": active.round_number if active else None,
            "ko_stage": active.ko_stage if active else None,
            "open_matches": sum(not m.is_completed for m in active.team_matches) if active else 0,
            "tables": [s.model_dump(exclude_none=True) for s in tables_status(t.id, db)],
        }


@mcp.tool()
async def enter_game_result(match_id: int, game_id: int, sets_a: int, sets_b: int) -> Dict[str, Any]:
    """Enters the final set count of one game (e.g. 3:1 means team A's player won 3 sets to 1).

    0:0 resets the game. Corrections are allowed. Returns the updated match.
    """
    with SessionLocal() as db:
        try:
            # Same path as the web UI, including the WebSocket broadcast
            await matches.set_game_result(match_id, game_id, GameResultUpdate(sets_a=sets_a, sets_b=sets_b), db)
        except HTTPException as e:
            raise ToolError(e.detail) from e
        return _match(db.get(TeamMatch, match_id))
