from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import Round, TeamMatch, Tournament
from backend.app.swiss_system import calculate_standings
from backend.app.table_status import tables_status

router = APIRouter(prefix="/api/monitors", tags=["Monitors"])


@router.get("/{tournament_id}/dashboard")
def get_monitor_dashboard(tournament_id: int, db: Session = Depends(get_db)) -> Dict[str, Any]:
    tournament = db.query(Tournament).filter(Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Turnier nicht gefunden")

    standings = calculate_standings(tournament_id, db)
    tables = tables_status(tournament_id, db)

    # Active round
    active_round = db.query(Round).filter(
        Round.tournament_id == tournament_id,
        Round.is_active == True
    ).order_by(Round.round_number.desc()).first()

    # Recent finished matches for the ticker
    recent_matches = db.query(TeamMatch).join(Round).filter(
        Round.tournament_id == tournament_id,
        TeamMatch.is_completed == True,
        TeamMatch.team_b_id.isnot(None)
    ).order_by(TeamMatch.id.desc()).limit(10).all()

    ticker = []
    for m in recent_matches:
        ticker.append({
            "id": m.id,
            "round_number": m.round.round_number,
            "team_a": m.team_a.name if m.team_a else "Team A",
            "team_b": m.team_b.name if m.team_b else "Team B",
            "score": f"{m.score_a}:{m.score_b}"
        })

    # KO Tree data if KO is active or rounds exist
    ko_rounds = db.query(Round).filter(
        Round.tournament_id == tournament_id,
        Round.round_type == "ko"
    ).order_by(Round.round_number.asc()).all()

    ko_tree = []
    for kr in ko_rounds:
        matches = []
        for m in sorted(kr.team_matches, key=lambda x: x.ko_slot or 0):
            matches.append({
                "match_id": m.id,
                "slot": m.ko_slot,
                "team_a": m.team_a.name if m.team_a else "TBD",
                "team_b": m.team_b.name if m.team_b else "TBD",
                "score_a": m.score_a,
                "score_b": m.score_b,
                "is_completed": m.is_completed,
                "winner_team_id": m.winner_team_id
            })
        ko_tree.append({
            "stage": kr.ko_stage,
            "round_number": kr.round_number,
            "matches": matches
        })

    return {
        "tournament_name": tournament.name,
        "current_round": active_round.round_number if active_round else tournament.current_round_number,
        "round_type": active_round.round_type if active_round else "swiss",
        "ko_stage": active_round.ko_stage if active_round else None,
        "tables": [t.model_dump() for t in tables],
        "standings": standings,
        "ticker": ticker,
        "ko_tree": ko_tree
    }
