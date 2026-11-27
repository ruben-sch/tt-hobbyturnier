import csv
import io
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from backend.app import progression
from backend.app.archive_pdf import build_archive_pdf
from backend.app.auth import require_admin
from backend.app.database import get_db
from backend.app.models import Tournament
from backend.app.routers.teams import new_team
from backend.app.schemas import (
    StandingsRow,
    TournamentCreate,
    TournamentResponse,
    TournamentUpdate,
)
from backend.app.swiss_system import calculate_standings
from backend.app.websocket_hub import ws_manager

HEADER_CELLS = {"team", "mannschaft", "teamname", "spieler", "name", "teilnehmer"}

router = APIRouter(prefix="/api/tournaments", tags=["Tournaments"])


def _get(tournament_id: int, db: Session) -> Tournament:
    t = db.get(Tournament, tournament_id)
    if not t:
        raise HTTPException(status_code=404, detail="Turnier nicht gefunden")
    return t


@router.get("", response_model=List[TournamentResponse])
def list_tournaments(db: Session = Depends(get_db)):
    """Every tournament, running (is_active) and abgeschlossen, newest first.

    An empty database gets a first tournament, so a fresh install opens straight into one.
    """
    if not db.query(Tournament).first():
        db.add(Tournament(name="Tischtennis Hobbyturnier", is_active=True))
        db.commit()
    return db.query(Tournament).order_by(Tournament.id.desc()).all()


@router.post("", response_model=TournamentResponse, dependencies=[Depends(require_admin)])
async def create_tournament(payload: TournamentCreate, db: Session = Depends(get_db)):
    """A new running tournament next to the others; nothing else is closed."""
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Der Turniername darf nicht leer sein.")
    tournament = Tournament(**{**payload.model_dump(), "name": payload.name.strip()}, is_active=True)
    db.add(tournament)
    db.commit()
    db.refresh(tournament)
    await ws_manager.broadcast({"type": "TOURNAMENT_CREATED", "tournament_id": tournament.id})
    return tournament


@router.get("/admin-check", dependencies=[Depends(require_admin)])
def check_admin_pin():
    """Lets the admin tab verify a PIN before unlocking; require_admin does the check."""
    return {"message": "Admin-PIN korrekt."}


@router.get("/{tournament_id}", response_model=TournamentResponse)
def get_tournament(tournament_id: int, db: Session = Depends(get_db)):
    return _get(tournament_id, db)


@router.delete("/{tournament_id}", dependencies=[Depends(require_admin)])
async def delete_tournament(tournament_id: int, db: Session = Depends(get_db)):
    t = _get(tournament_id, db)
    try:
        progression.delete_tournament(t, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    db.commit()
    await ws_manager.broadcast({"type": "TOURNAMENT_DELETED", "tournament_id": tournament_id})
    return {"message": "Turnier gelöscht."}


@router.put("/{tournament_id}", response_model=TournamentResponse, dependencies=[Depends(require_admin)])
async def update_tournament(tournament_id: int, payload: TournamentUpdate, db: Session = Depends(get_db)):
    t = _get(tournament_id, db)
    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(t, field, val)

    db.commit()
    db.refresh(t)

    await ws_manager.broadcast({"type": "TOURNAMENT_UPDATED", "tournament_id": t.id})
    return t


@router.post("/{tournament_id}/reset", dependencies=[Depends(require_admin)])
async def reset_tournament(tournament_id: int, db: Session = Depends(get_db)):
    """Deletes all teams, rounds and results of this tournament; its settings stay."""
    t = _get(tournament_id, db)
    progression.reset_tournament(t, db)
    db.commit()
    await ws_manager.broadcast({"type": "TOURNAMENT_UPDATED", "tournament_id": t.id})
    return {"message": "Turnier zurückgesetzt."}


@router.get("/{tournament_id}/standings", response_model=List[StandingsRow])
def get_standings(tournament_id: int, db: Session = Depends(get_db)):
    return calculate_standings(tournament_id, db)


@router.post("/{tournament_id}/teams/csv", dependencies=[Depends(require_admin)])
async def import_teams_csv(tournament_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """2er-Teams: Teamname;Spieler 1;Spieler 2 per row. Einzelturnier: the player's name in the first column."""
    tournament = _get(tournament_id, db)
    content = await file.read()
    text = content.decode("utf-8-sig", errors="ignore")
    reader = csv.reader(io.StringIO(text), delimiter=";" if ";" in text else ",")

    imported = []
    for row in reader:
        if not row or not row[0].strip():
            continue
        # Skip header if present
        if row[0].strip().lower() in HEADER_CELLS:
            continue
        try:
            team = new_team(tournament, *row[:3])
        except ValueError:
            continue  # incomplete row
        db.add(team)
        imported.append(team.name)

    db.commit()
    await ws_manager.broadcast({"type": "TEAMS_UPDATED", "tournament_id": tournament_id})
    unit = "Spieler" if tournament.is_singles else "Teams"
    return {"message": f"{len(imported)} {unit} erfolgreich importiert", "teams": imported}


@router.get("/{tournament_id}/export/csv")
def export_standings_csv(tournament_id: int, db: Session = Depends(get_db)):
    singles = _get(tournament_id, db).is_singles
    standings = calculate_standings(tournament_id, db)

    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")
    # An Einzelturnier has no player columns (the player is the name) and no draws
    names = ["Platz", "Spieler"] if singles else ["Platz", "Mannschaft", "Spieler 1", "Spieler 2"]
    results = ["Spiele", "S", "N"] if singles else ["Spiele", "S", "U", "N", "Spielpunkte", "Gegenpunkte"]
    writer.writerow(names + results + ["Buchholz", "Sätze+", "Sätze-", "Satz-Diff"])

    for s in standings:
        name_cells = [s["rank"], s["team_name"]] + ([] if singles else [s["player1"], s["player2"]])
        result_cells = (
            [s["matches_played"], s["won_matches"], s["lost_matches"]] if singles else
            [s["matches_played"], s["won_matches"], s["drawn_matches"], s["lost_matches"],
             s["game_points"], s["game_points_lost"]]
        )
        writer.writerow(name_cells + result_cells + [s["buchholz"], s["sets_won"], s["sets_lost"], s["set_diff"]])

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=turnier_ergebnisse_{tournament_id}.csv"}
    )


@router.get("/{tournament_id}/export/pdf")
def export_archive_pdf(tournament_id: int, db: Session = Depends(get_db)):
    return Response(
        build_archive_pdf(_get(tournament_id, db), db),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=turnier_archiv_{tournament_id}.pdf"},
    )
