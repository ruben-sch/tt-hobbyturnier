"""MCP server (Streamable HTTP under /mcp) for AI assistants: read results and standings, enter results.

Every request needs the Turnierleitung's authorization (see mcp_auth): an OAuth token
(claude.ai) or the admin PIN as `Authorization: Bearer <PIN>` / `X-Admin-Pin` header.
"""

from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from sqlalchemy.orm import Session

from backend.app.auth import running_tournaments
from backend.app.database import SessionLocal
from backend.app.live_status import round_matches
from backend.app.mcp_auth import auth_settings, provider
from backend.app.models import Round, TeamMatch, Tournament
from backend.app.routers import matches
from backend.app.schemas import GameResultUpdate
from backend.app.swiss_system import calculate_standings

mcp = MCPServer(
    name="tt-hobbyturnier",
    instructions=(
        "Tischtennis-Hobbyturnier, pro Turnier entweder mit 2er-Teams oder als Einzelturnier (is_singles). "
        "Bei 2er-Teams besteht eine Begegnung (match) aus 4 Einzeln, in der KO-Phase bei 2:2 plus Doppel. "
        "Im Einzelturnier ist ein Team ein einzelner Spieler und eine Begegnung genau ein Spiel. "
        "Pro Spiel wird nur der Satzstand (z.B. 3:1) eingetragen, Satz- oder Ballstände gibt es nicht."
    ),
    auth=auth_settings,
    auth_server_provider=provider,
)


def _tournaments(db: Session, tournament_id: Optional[int]) -> List[Tournament]:
    """The tournament asked for, or without an id every running one."""
    if tournament_id is not None:
        tournament = db.get(Tournament, tournament_id)
        if tournament is None:
            raise ToolError("Turnier nicht gefunden.")
        return [tournament]
    tournaments = running_tournaments(db)
    if not tournaments:
        raise ToolError("Kein laufendes Turnier.")
    return tournaments


def _label(t: Tournament) -> Dict[str, Any]:
    return {"tournament_id": t.id, "tournament": t.name}


def _game(g) -> Dict[str, Any]:
    return {
        "game_id": g.id,
        "game": "Doppel" if g.is_doubles else "Spiel" if g.team_match.round.tournament.is_singles
        else f"Einzel {g.game_order}",
        "player_a": g.player_a_name,
        "player_b": g.player_b_name,
        "sets": f"{g.sets_won_a}:{g.sets_won_b}" if g.is_completed else None,
    }


def _match(m: TeamMatch) -> Dict[str, Any]:
    return {
        "match_id": m.id,
        "team_a": m.team_a.name,
        "team_b": m.team_b.name if m.team_b else None,
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
def list_tournaments() -> List[Dict[str, Any]]:
    """Every tournament (one per class, e.g. Hobby and Jugend), newest first; running ones have is_running."""
    with SessionLocal() as db:
        return [
            {**_label(t), "is_running": bool(t.is_active), "is_singles": bool(t.is_singles),
             "current_round_number": t.current_round_number}
            for t in db.query(Tournament).order_by(Tournament.id.desc()).all()
        ]


@mcp.tool()
def get_tournament(tournament_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Name, settings and an overview of all rounds. Without tournament_id: every running tournament."""
    with SessionLocal() as db:
        result = []
        for t in _tournaments(db, tournament_id):
            rounds = db.query(Round).filter(Round.tournament_id == t.id).order_by(Round.round_number).all()
            result.append({
                **_label(t),
                "is_running": bool(t.is_active),
                "is_singles": bool(t.is_singles),
                "swiss_rounds_count": t.swiss_rounds_count,
                "ko_enabled": t.ko_enabled,
                "best_of_sets": t.best_of_sets,
                "current_round_number": t.current_round_number,
                "rounds": [{k: v for k, v in _round(r).items() if k != "matches"} for r in rounds],
            })
        return result


@mcp.tool()
def get_standings(tournament_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Current standings (Tabelle), best team first. Without tournament_id: every running tournament."""
    with SessionLocal() as db:
        return [
            {**_label(t), "standings": calculate_standings(t.id, db)}
            for t in _tournaments(db, tournament_id)
        ]


@mcp.tool()
def get_round(round_number: Optional[int] = None, tournament_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """All matches of a round with their games, set counts and the match/game ids needed to enter results.

    Without round_number: the active round, or the last one if none is active.
    Without tournament_id: that round of every running tournament.
    """
    with SessionLocal() as db:
        result = []
        for t in _tournaments(db, tournament_id):
            query = db.query(Round).filter(Round.tournament_id == t.id)
            if round_number is not None:
                r = query.filter(Round.round_number == round_number).first()
            else:
                r = query.order_by(Round.is_active.desc(), Round.round_number.desc()).first()
            if r is not None:
                result.append({**_label(t), **_round(r)})
        if not result:
            raise ToolError("Runde nicht gefunden.")
        return result


@mcp.tool()
def get_live_status(tournament_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """What is being played right now: per open match its score and running game (games run in order).

    Without tournament_id: every running tournament.
    """
    with SessionLocal() as db:
        result = []
        for t in _tournaments(db, tournament_id):
            active = db.query(Round).filter(Round.tournament_id == t.id, Round.is_active == True).first()
            matches = round_matches(t.id, db)
            result.append({
                **_label(t),
                "round_number": active.round_number if active else None,
                "ko_stage": active.ko_stage if active else None,
                "open_matches": [
                    {k: v for k, v in m.items() if k != "games"} for m in matches if not m["is_completed"]
                ],
            })
        return result


@mcp.tool()
async def enter_game_result(match_id: int, game_id: int, sets_a: int, sets_b: int) -> Dict[str, Any]:
    """Enters the final set count of one game (e.g. 3:1 means team A's player won 3 sets to 1).

    In an Einzelturnier the match has exactly one game; its set count decides the match.

    0:0 resets the game. Corrections are allowed. Returns the updated match.
    """
    with SessionLocal() as db:
        try:
            # Same path as the web UI, including the WebSocket broadcast
            await matches.set_game_result(match_id, game_id, GameResultUpdate(sets_a=sets_a, sets_b=sets_b), db)
        except HTTPException as e:
            raise ToolError(e.detail) from e
        return _match(db.get(TeamMatch, match_id))
