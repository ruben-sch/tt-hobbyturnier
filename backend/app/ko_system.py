from sqlalchemy.orm import Session

from backend.app.models import Round, Team, TeamMatch, Tournament
from backend.app.swiss_system import calculate_standings, setup_games_for_match


def generate_ko_phase(tournament_id: int, team_count: int, db: Session) -> Round:
    """
    Initializes the first round of the KO phase based on Swiss standings.
    team_count is either 4 (Halbfinale) or 8 (Viertelfinale).
    """
    tournament = db.query(Tournament).filter(Tournament.id == tournament_id).first()
    standings = calculate_standings(tournament_id, db)
    
    if len(standings) < team_count:
        raise ValueError(f"Nicht genügend Teams vorhanden ({len(standings)} < {team_count}) für die KO-Runde.")

    top_team_ids = [s["team_id"] for s in standings[:team_count]]

    round_number = tournament.current_round_number + 1
    stage_name = "Halbfinale" if team_count == 4 else "Viertelfinale"

    ko_round = Round(
        tournament_id=tournament_id,
        round_number=round_number,
        round_type="ko",
        ko_stage=stage_name,
        is_completed=False,
        is_active=True
    )
    db.add(ko_round)
    db.flush()

    tournament.current_round_number = round_number
    tournament.ko_enabled = True
    tournament.ko_teams_count = team_count

    # Seed pairings
    # Top 4: 1 vs 4, 2 vs 3
    # Top 8: (1 vs 8), (4 vs 5), (2 vs 7), (3 vs 6)
    if team_count == 4:
        pairings = [
            (top_team_ids[0], top_team_ids[3], 1),  # SF1 (slot 1)
            (top_team_ids[1], top_team_ids[2], 2),  # SF2 (slot 2)
        ]
    else:
        pairings = [
            (top_team_ids[0], top_team_ids[7], 1),  # QF1
            (top_team_ids[3], top_team_ids[4], 2),  # QF2
            (top_team_ids[1], top_team_ids[6], 3),  # QF3
            (top_team_ids[2], top_team_ids[5], 4),  # QF4
        ]

    table_num = 1
    for t_a, t_b, slot in pairings:
        team_a = db.get(Team, t_a)
        team_b = db.get(Team, t_b)

        tbl_a = table_num
        tbl_b = table_num + 1 if tournament.tables_per_match == 2 else None
        table_num += (2 if tournament.tables_per_match == 2 else 1)
        if table_num > tournament.table_count:
            table_num = 1

        match = TeamMatch(
            round_id=ko_round.id,
            team_a_id=t_a,
            team_b_id=t_b,
            table_number=tbl_a,
            table_number_b=tbl_b,
            match_pin=f"{slot:02d}{random_pin()}",
            team_a_p1_name=team_a.player1_name,
            team_a_p2_name=team_a.player2_name,
            team_b_p1_name=team_b.player1_name,
            team_b_p2_name=team_b.player2_name,
            lineup_confirmed=False,
            score_a=0,
            score_b=0,
            ko_slot=slot,
            is_completed=False
        )
        db.add(match)
        db.flush()

        setup_games_for_match(match, tournament.best_of_sets, db)

    db.commit()
    db.refresh(ko_round)
    return ko_round


def advance_ko_round(tournament_id: int, db: Session) -> Round:
    """
    Creates the next KO stage (e.g. Halbfinale after Viertelfinale, or Finale after Halbfinale)
    with the winners of the previous round.
    """
    tournament = db.query(Tournament).filter(Tournament.id == tournament_id).first()
    last_round = db.query(Round).filter(
        Round.tournament_id == tournament_id,
        Round.round_type == "ko"
    ).order_by(Round.round_number.desc()).first()

    if not last_round:
        raise ValueError("Keine vorherige KO-Runde gefunden.")

    # Check if all matches in last round are completed
    uncompleted = db.query(TeamMatch).filter(
        TeamMatch.round_id == last_round.id,
        TeamMatch.is_completed == False
    ).count()

    if uncompleted > 0:
        raise ValueError("Es sind noch nicht alle Begegnungen der aktuellen KO-Runde abgeschlossen.")

    last_matches = db.query(TeamMatch).filter(
        TeamMatch.round_id == last_round.id
    ).order_by(TeamMatch.ko_slot.asc()).all()

    winners = [m.winner_team_id for m in last_matches if m.winner_team_id is not None]

    if len(winners) == 2:
        next_stage = "Finale"
        pairings = [(winners[0], winners[1], 1)]
    elif len(winners) == 4:
        next_stage = "Halbfinale"
        pairings = [
            (winners[0], winners[1], 1),  # Winner QF1 vs Winner QF2
            (winners[2], winners[3], 2),  # Winner QF3 vs Winner QF4
        ]
    else:
        raise ValueError(f"Ungültige Anzahl an Siegern für Folgerunde ({len(winners)})")

    next_round_num = last_round.round_number + 1
    new_round = Round(
        tournament_id=tournament_id,
        round_number=next_round_num,
        round_type="ko",
        ko_stage=next_stage,
        is_completed=False,
        is_active=True
    )
    db.add(new_round)
    db.flush()

    tournament.current_round_number = next_round_num

    table_num = 1
    for t_a, t_b, slot in pairings:
        team_a = db.get(Team, t_a)
        team_b = db.get(Team, t_b)

        tbl_a = table_num
        tbl_b = table_num + 1 if tournament.tables_per_match == 2 else None
        table_num += (2 if tournament.tables_per_match == 2 else 1)

        match = TeamMatch(
            round_id=new_round.id,
            team_a_id=t_a,
            team_b_id=t_b,
            table_number=tbl_a,
            table_number_b=tbl_b,
            match_pin=f"{slot:02d}{random_pin()}",
            team_a_p1_name=team_a.player1_name,
            team_a_p2_name=team_a.player2_name,
            team_b_p1_name=team_b.player1_name,
            team_b_p2_name=team_b.player2_name,
            lineup_confirmed=False,
            score_a=0,
            score_b=0,
            ko_slot=slot,
            is_completed=False
        )
        db.add(match)
        db.flush()

        setup_games_for_match(match, tournament.best_of_sets, db)

    db.commit()
    db.refresh(new_round)
    return new_round


def random_pin() -> str:
    import random
    return str(random.randint(10, 99))
