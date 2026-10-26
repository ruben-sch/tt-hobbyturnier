"""
The games of a team match: who plays whom in which order and on which table.

Every team has lineup positions 1 and 2. The singles cross over first, then
the direct duels; the KO deciding doubles is game 5. With two tables per
match, games 2 and 4 go to the second table.
"""
from typing import Dict

from sqlalchemy.orm import Session

from backend.app.models import IndividualGame, TeamMatch

# game_order -> (position of team A, position of team B, second table?)
SINGLES = {
    1: (1, 2, False),
    2: (2, 1, True),
    3: (1, 1, False),
    4: (2, 2, True),
}
DOUBLES_ORDER = 5


def _lineup(match: TeamMatch) -> Dict[str, Dict[int, str]]:
    def side(name, p1, p2, team):
        return {
            1: p1 or (team.player1_name if team else f"Spieler {name}1"),
            2: p2 or (team.player2_name if team else f"Spieler {name}2"),
        }
    return {
        "A": side("A", match.team_a_p1_name, match.team_a_p2_name, match.team_a),
        "B": side("B", match.team_b_p1_name, match.team_b_p2_name, match.team_b),
    }


def create_games(match: TeamMatch, db: Session) -> None:
    """Creates the 4 singles of a match from its lineup (team players until one is confirmed)."""
    lineup = _lineup(match)
    for order, (pos_a, pos_b, second_table) in SINGLES.items():
        db.add(IndividualGame(
            team_match_id=match.id,
            game_order=order,
            is_doubles=False,
            player_a_name=lineup["A"][pos_a],
            player_b_name=lineup["B"][pos_b],
            table_number=(match.table_number_b or match.table_number) if second_table else match.table_number,
        ))


def apply_lineup(match: TeamMatch, a1: str, a2: str, b1: str, b2: str) -> None:
    """Confirms the lineup and renames the players of all existing games."""
    match.team_a_p1_name, match.team_a_p2_name = a1, a2
    match.team_b_p1_name, match.team_b_p2_name = b1, b2
    match.lineup_confirmed = True

    lineup = _lineup(match)
    for g in match.individual_games:
        if g.is_doubles:
            g.player_a_name, g.player_b_name = _doubles_names(lineup)
        elif g.game_order in SINGLES:
            pos_a, pos_b, _ = SINGLES[g.game_order]
            g.player_a_name, g.player_b_name = lineup["A"][pos_a], lineup["B"][pos_b]


def _doubles_names(lineup):
    return (f"{lineup['A'][1]} / {lineup['A'][2]}", f"{lineup['B'][1]} / {lineup['B'][2]}")


def add_deciding_doubles(match: TeamMatch, db: Session) -> IndividualGame:
    """Adds the Entscheidungsdoppel (game 5) if the match doesn't have it yet."""
    existing = next((g for g in match.individual_games if g.game_order == DOUBLES_ORDER), None)
    if existing:
        return existing

    player_a, player_b = _doubles_names(_lineup(match))
    game = IndividualGame(
        team_match_id=match.id,
        game_order=DOUBLES_ORDER,
        is_doubles=True,
        player_a_name=player_a,
        player_b_name=player_b,
        table_number=match.table_number,
    )
    match.individual_games.append(game)
    db.flush()
    return game
