"""
The games of a team match: who plays whom in which order.

Every team has positions 1 and 2 (player 1 and 2 from registration). The singles cross over first, then
the direct duels; the KO deciding doubles is game 5. Tables aren't tracked: the
Turnierleitung writes the table number on the match sheet by hand.
"""
from typing import Dict

from sqlalchemy.orm import Session

from backend.app.models import IndividualGame, TeamMatch

# game_order -> (position of team A, position of team B)
SINGLES = {
    1: (1, 2),
    2: (2, 1),
    3: (1, 1),
    4: (2, 2),
}
DOUBLES_ORDER = 5


def _positions(match: TeamMatch) -> Dict[str, Dict[int, str]]:
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
    """Creates the 4 singles of a match from its players at position 1 and 2."""
    players = _positions(match)
    for order, (pos_a, pos_b) in SINGLES.items():
        db.add(IndividualGame(
            team_match_id=match.id,
            game_order=order,
            is_doubles=False,
            player_a_name=players["A"][pos_a],
            player_b_name=players["B"][pos_b],
        ))


def _doubles_names(players):
    return (f"{players['A'][1]} / {players['A'][2]}", f"{players['B'][1]} / {players['B'][2]}")


def add_deciding_doubles(match: TeamMatch, db: Session) -> IndividualGame:
    """Adds the Entscheidungsdoppel (game 5) if the match doesn't have it yet."""
    existing = next((g for g in match.individual_games if g.game_order == DOUBLES_ORDER), None)
    if existing:
        return existing

    player_a, player_b = _doubles_names(_positions(match))
    game = IndividualGame(
        team_match_id=match.id,
        game_order=DOUBLES_ORDER,
        is_doubles=True,
        player_a_name=player_a,
        player_b_name=player_b,
    )
    match.individual_games.append(game)
    db.flush()
    return game
