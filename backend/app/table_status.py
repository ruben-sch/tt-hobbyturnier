from typing import List

from sqlalchemy.orm import Session

from backend.app.models import Round, TeamMatch, Tournament
from backend.app.schemas import TableStatusResponse


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

        game_desc = ""
        if active_game:
            label = "Doppel" if active_game.is_doubles else f"Einzel {active_game.game_order}"
            game_desc = f"{label}: {active_game.player_a_name or 'A'} vs {active_game.player_b_name or 'B'}"

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
