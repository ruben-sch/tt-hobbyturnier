import csv
import io
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from backend.app import progression
from backend.app.archive_pdf import build_archive_pdf
from backend.app.auth import require_admin
from backend.app.database import get_db
from backend.app.models import Table, Team, Tournament, default_admin_pin
from backend.app.schemas import (
    StandingsRow,
    TournamentCreate,
    TournamentResponse,
    TournamentUpdate,
)
from backend.app.swiss_system import calculate_standings
from backend.app.websocket_hub import ws_manager

router = APIRouter(prefix="/api/tournaments", tags=["Tournaments"])


def validate_admin_pin(pin: Optional[str]) -> str:
    pin = (pin or "").strip()
    if not pin:
        raise HTTPException(status_code=400, detail="Die Admin-PIN darf nicht leer sein.")
    try:
        # The PIN travels in an HTTP header, which browsers only send as Latin-1.
        pin.encode("latin-1")
    except UnicodeEncodeError:
        raise HTTPException(
            status_code=400, detail="Die Admin-PIN darf keine Emojis oder exotischen Sonderzeichen enthalten."
        ) from None
    return pin


@router.post("", response_model=TournamentResponse, dependencies=[Depends(require_admin)])
def create_tournament(payload: TournamentCreate, db: Session = Depends(get_db)):
    # Deactivate existing active tournaments
    db.query(Tournament).filter(Tournament.is_active == True).update({"is_active": False})

    tournament = Tournament(
        name=payload.name,
        swiss_rounds_count=payload.swiss_rounds_count,
        ko_enabled=payload.ko_enabled,
        ko_teams_count=payload.ko_teams_count,
        best_of_sets=payload.best_of_sets,
        table_count=payload.table_count,
        tables_per_match=payload.tables_per_match,
        admin_pin=validate_admin_pin(payload.admin_pin),
        is_active=True
    )
    db.add(tournament)
    db.flush()

    # Generate tables with default PINs (e.g. Table 1: PIN 1001, Table 2: PIN 1002)
    for i in range(1, tournament.table_count + 1):
        tbl = Table(
            tournament_id=tournament.id,
            table_number=i,
            pin_code=f"{1000 + i}"
        )
        db.add(tbl)

    db.commit()
    db.refresh(tournament)
    return tournament


@router.get("/active", response_model=TournamentResponse)
def get_active_tournament(db: Session = Depends(get_db)):
    t = db.query(Tournament).filter(Tournament.is_active == True).order_by(Tournament.id.desc()).first()
    if not t:
        # Create a default tournament
        t = Tournament(
            name="Tischtennis Hobbyturnier",
            swiss_rounds_count=5,
            ko_enabled=False,
            ko_teams_count=4,
            best_of_sets=5,
            table_count=8,
            tables_per_match=1,
            admin_pin=default_admin_pin(),
            is_active=True
        )
        db.add(t)
        db.flush()
        for i in range(1, t.table_count + 1):
            db.add(Table(tournament_id=t.id, table_number=i, pin_code=f"{1000 + i}"))
        db.commit()
        db.refresh(t)
    return t


@router.put("/{tournament_id}", response_model=TournamentResponse, dependencies=[Depends(require_admin)])
async def update_tournament(tournament_id: int, payload: TournamentUpdate, db: Session = Depends(get_db)):
    t = db.query(Tournament).filter(Tournament.id == tournament_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Turnier nicht gefunden")

    updates = payload.model_dump(exclude_unset=True)
    if "admin_pin" in updates:
        updates["admin_pin"] = validate_admin_pin(updates["admin_pin"])

    for field, val in updates.items():
        setattr(t, field, val)

    # Sync table count if changed
    if payload.table_count and payload.table_count != len(t.tables):
        current_tables = {tbl.table_number: tbl for tbl in t.tables}
        for num in range(1, payload.table_count + 1):
            if num not in current_tables:
                db.add(Table(tournament_id=t.id, table_number=num, pin_code=f"{1000 + num}"))

    db.commit()
    db.refresh(t)

    await ws_manager.broadcast({"type": "TOURNAMENT_UPDATED", "tournament_id": t.id})
    return t


@router.post("/{tournament_id}/reset", dependencies=[Depends(require_admin)])
async def reset_tournament(tournament_id: int, db: Session = Depends(get_db)):
    """Deletes all teams, rounds and results; settings and admin PIN stay."""
    t = db.get(Tournament, tournament_id)
    if not t:
        raise HTTPException(status_code=404, detail="Turnier nicht gefunden")
    progression.reset_tournament(t, db)
    db.commit()
    await ws_manager.broadcast({"type": "TOURNAMENT_UPDATED", "tournament_id": t.id})
    return {"message": "Turnier zurückgesetzt."}


@router.get("/{tournament_id}/admin-check", dependencies=[Depends(require_admin)])
def check_admin_pin(tournament_id: int, db: Session = Depends(get_db)):
    """Lets the admin tab verify a PIN before unlocking; require_admin does the check."""
    if not db.get(Tournament, tournament_id):
        raise HTTPException(status_code=404, detail="Turnier nicht gefunden")
    return {"message": "Admin-PIN korrekt."}


@router.get("/{tournament_id}/standings", response_model=List[StandingsRow])
def get_standings(tournament_id: int, db: Session = Depends(get_db)):
    return calculate_standings(tournament_id, db)


@router.post("/{tournament_id}/teams/csv", dependencies=[Depends(require_admin)])
async def import_teams_csv(tournament_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    t = db.query(Tournament).filter(Tournament.id == tournament_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Turnier nicht gefunden")

    content = await file.read()
    text = content.decode("utf-8-sig", errors="ignore")
    reader = csv.reader(io.StringIO(text), delimiter=";" if ";" in text else ",")

    imported = []
    for row in reader:
        if not row or len(row) < 3:
            continue
        # Skip header if present
        if row[0].strip().lower() in ["team", "mannschaft", "teamname"]:
            continue
        
        name = row[0].strip()
        p1 = row[1].strip()
        p2 = row[2].strip()
        if not name or not p1 or not p2:
            continue

        team = Team(
            tournament_id=tournament_id,
            name=name,
            player1_name=p1,
            player2_name=p2
        )
        db.add(team)
        imported.append(name)

    db.commit()
    await ws_manager.broadcast({"type": "TEAMS_UPDATED", "tournament_id": tournament_id})
    return {"message": f"{len(imported)} Teams erfolgreich importiert", "teams": imported}


@router.get("/{tournament_id}/export/csv")
def export_standings_csv(tournament_id: int, db: Session = Depends(get_db)):
    standings = calculate_standings(tournament_id, db)

    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")
    writer.writerow([
        "Platz", "Mannschaft", "Spieler 1", "Spieler 2",
        "Spiele", "S", "U", "N", "Spielpunkte", "Gegenpunkte",
        "Buchholz", "Sätze+", "Sätze-", "Satz-Diff"
    ])

    for s in standings:
        writer.writerow([
            s["rank"], s["team_name"], s["player1"], s["player2"],
            s["matches_played"], s["won_matches"], s["drawn_matches"], s["lost_matches"],
            s["game_points"], s["game_points_lost"], s["buchholz"],
            s["sets_won"], s["sets_lost"], s["set_diff"]
        ])

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=turnier_ergebnisse_{tournament_id}.csv"}
    )


@router.get("/{tournament_id}/export/pdf")
def export_archive_pdf(tournament_id: int, db: Session = Depends(get_db)):
    t = db.get(Tournament, tournament_id)
    if not t:
        raise HTTPException(status_code=404, detail="Turnier nicht gefunden")
    return Response(
        build_archive_pdf(t, db),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=turnier_archiv_{tournament_id}.pdf"},
    )
