from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.auth import require_admin
from backend.app.database import get_db
from backend.app.models import Team, Tournament
from backend.app.schemas import TeamCreate, TeamResponse
from backend.app.websocket_hub import ws_manager

router = APIRouter(prefix="/api/tournaments/{tournament_id}/teams", tags=["Teams"])


@router.get("", response_model=List[TeamResponse])
def get_teams(tournament_id: int, db: Session = Depends(get_db)):
    return Team.active(db, tournament_id).order_by(Team.id.asc()).all()


@router.post("", response_model=TeamResponse, dependencies=[Depends(require_admin)])
async def create_team(tournament_id: int, payload: TeamCreate, db: Session = Depends(get_db)):
    t = db.query(Tournament).filter(Tournament.id == tournament_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Turnier nicht gefunden")

    team = Team(
        tournament_id=tournament_id,
        name=payload.name,
        player1_name=payload.player1_name,
        player2_name=payload.player2_name
    )
    db.add(team)
    db.commit()
    db.refresh(team)

    await ws_manager.broadcast({"type": "TEAMS_UPDATED", "tournament_id": tournament_id})
    return team


@router.delete("/{team_id}", dependencies=[Depends(require_admin)])
async def delete_team(tournament_id: int, team_id: int, db: Session = Depends(get_db)):
    team = db.query(Team).filter(
        Team.id == team_id,
        Team.tournament_id == tournament_id
    ).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team nicht gefunden")

    team.is_active = False
    db.commit()

    await ws_manager.broadcast({"type": "TEAMS_UPDATED", "tournament_id": tournament_id})
    return {"message": "Team gelöscht"}
