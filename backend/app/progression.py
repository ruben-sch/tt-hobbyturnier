"""
The round lifecycle of a tournament: Swiss rounds, then optionally a KO phase.

Only one round is open at a time. A round opens with its matches, tables and
games set up, and closes once every match is completed. Errors are
ValueErrors with a German message; callers commit.
"""
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session

from backend.app import match_rules
from backend.app.match_sheet import create_games
from backend.app.models import Round, Team, TeamMatch, Tournament
from backend.app.swiss_system import calculate_standings, generate_swiss_round_pairings

# (team_a_id, team_b_id or None for a bye, KO slot or None)
Pairing = Tuple[int, Optional[int], Optional[int]]

# Seeding by Swiss rank (1-based): 1–4, 2–3 for the semis; 1–8, 4–5, 2–7, 3–6 for the quarters.
KO_SEEDING = {
    4: ("Halbfinale", [(1, 4), (2, 3)]),
    8: ("Viertelfinale", [(1, 8), (4, 5), (2, 7), (3, 6)]),
}
NEXT_KO_STAGE = {2: "Finale", 4: "Halbfinale"}


def next_swiss_round(tournament: Tournament, db: Session) -> Round:
    _ensure_no_open_round(tournament, db)
    if Team.active(db, tournament.id).count() < 2:
        raise ValueError("Es werden mindestens 2 Mannschaften benötigt.")
    pairings = [(a, b, None) for a, b in generate_swiss_round_pairings(tournament.id, db)]
    return _open_round(tournament, "swiss", None, pairings, db)


def start_ko(tournament: Tournament, team_count: int, db: Session) -> Round:
    if team_count not in KO_SEEDING:
        raise ValueError("Die KO-Runde startet mit 4 oder 8 Teams.")
    _ensure_no_open_round(tournament, db)
    standings = calculate_standings(tournament.id, db)
    if len(standings) < team_count:
        raise ValueError(f"Nicht genügend Teams vorhanden ({len(standings)} < {team_count}) für die KO-Runde.")

    stage, seeding = KO_SEEDING[team_count]
    seeds = [s["team_id"] for s in standings]
    pairings = [(seeds[a - 1], seeds[b - 1], slot) for slot, (a, b) in enumerate(seeding, start=1)]

    tournament.ko_enabled = True
    tournament.ko_teams_count = team_count
    return _open_round(tournament, "ko", stage, pairings, db)


def advance_ko(tournament: Tournament, db: Session) -> Round:
    """Closes the finished KO round and pairs its winners in slot order (winner 1 vs 2, 3 vs 4)."""
    last_round = db.query(Round).filter(
        Round.tournament_id == tournament.id,
        Round.round_type == "ko",
    ).order_by(Round.round_number.desc()).first()
    if not last_round:
        raise ValueError("Keine vorherige KO-Runde gefunden.")
    if any(not m.is_completed for m in last_round.team_matches):
        raise ValueError("Es sind noch nicht alle Begegnungen der aktuellen KO-Runde abgeschlossen.")

    winners = [m.winner_team_id for m in sorted(last_round.team_matches, key=lambda m: m.ko_slot)]
    if len(winners) not in NEXT_KO_STAGE:
        raise ValueError(f"Ungültige Anzahl an Siegern für Folgerunde ({len(winners)})")

    _close(last_round)
    pairings = [(winners[i], winners[i + 1], i // 2 + 1) for i in range(0, len(winners), 2)]
    return _open_round(tournament, "ko", NEXT_KO_STAGE[len(winners)], pairings, db)


def complete_round(round_obj: Round) -> None:
    open_matches = sum(1 for m in round_obj.team_matches if not m.is_completed)
    if open_matches:
        raise ValueError(f"Es sind noch {open_matches} Spiele nicht abgeschlossen.")
    _close(round_obj)


def reset_tournament(tournament: Tournament, db: Session) -> None:
    """Deletes every team, round, match and game; settings and admin PIN stay. Older tournaments go too."""
    for round_obj in list(tournament.rounds):
        db.delete(round_obj)
    db.flush()  # matches reference teams, so they go first
    for team in list(tournament.teams):
        db.delete(team)
    tournament.current_round_number = 0
    for old in db.query(Tournament).filter(Tournament.id != tournament.id).all():
        db.delete(old)
    db.flush()


def _close(round_obj: Round) -> None:
    round_obj.is_completed = True
    round_obj.is_active = False


def _ensure_no_open_round(tournament: Tournament, db: Session) -> None:
    open_round = db.query(Round).filter(
        Round.tournament_id == tournament.id,
        Round.is_completed == False,
    ).first()
    if open_round:
        raise ValueError(f"Runde {open_round.round_number} ist noch aktiv und nicht abgeschlossen.")


def _assign_tables(tournament: Tournament, pairings: List[Pairing]) -> List[Tuple[Optional[int], Optional[int]]]:
    """Hands out tables in order and starts again at table 1 when the next match doesn't fit."""
    width = 2 if tournament.tables_per_match == 2 else 1
    tables = []
    next_table = 1
    for _, team_b_id, _ in pairings:
        if team_b_id is None:
            tables.append((None, None))
            continue
        if next_table + width - 1 > tournament.table_count:
            next_table = 1
        tables.append((next_table, next_table + 1 if width == 2 else None))
        next_table += width
    return tables


def _open_round(
    tournament: Tournament, round_type: str, ko_stage: Optional[str], pairings: List[Pairing], db: Session
) -> Round:
    round_number = tournament.current_round_number + 1
    new_round = Round(
        tournament_id=tournament.id,
        round_number=round_number,
        round_type=round_type,
        ko_stage=ko_stage,
        is_completed=False,
        is_active=True,
    )
    db.add(new_round)
    db.flush()
    tournament.current_round_number = round_number

    for (team_a_id, team_b_id, slot), (table_a, table_b) in zip(
        pairings, _assign_tables(tournament, pairings), strict=True
    ):
        team_a = db.get(Team, team_a_id)
        team_b = db.get(Team, team_b_id) if team_b_id is not None else None
        match = TeamMatch(
            round_id=new_round.id,
            team_a_id=team_a_id,
            team_b_id=team_b_id,
            table_number=table_a,
            table_number_b=table_b,
            ko_slot=slot,
            team_a_p1_name=team_a.player1_name,
            team_a_p2_name=team_a.player2_name,
            team_b_p1_name=team_b.player1_name if team_b else None,
            team_b_p2_name=team_b.player2_name if team_b else None,
            score_a=0,
            score_b=0,
            is_completed=False,
        )
        if team_b is None:
            bye = match_rules.bye_result()
            match.score_a, match.score_b = bye.score_a, bye.score_b
            match.is_completed = True
            match.winner_team_id = team_a_id
        db.add(match)
        db.flush()
        if team_b is not None:
            create_games(match, db)

    db.flush()
    db.refresh(new_round)
    return new_round
