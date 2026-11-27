"""
Scoring rules of a team match, without database or HTTP.

Swiss matches are 4 singles and may end 2:2. KO matches end at 3 wins; 2:2
after the singles calls for a deciding doubles. In an Einzelturnier a match is
one single, so it can't be drawn and has no doubles; its score is the set count
of that game (3:1 says more than 1:0). Only the final set count of
each game is recorded.
"""
from typing import NamedTuple, Optional, Sequence

SWISS_SINGLES = 4  # singles of a team match
KO_WINS_NEEDED = 3


def singles_per_match(is_singles: bool) -> int:
    """4 singles between 2er-Teams, one game between two players in an Einzelturnier."""
    return 1 if is_singles else SWISS_SINGLES


class GameResult(NamedTuple):
    sets_a: int
    sets_b: int
    is_completed: bool
    winner_side: Optional[str]  # "A", "B" or None while open


class MatchResult(NamedTuple):
    score_a: int
    score_b: int
    is_completed: bool
    winner_side: Optional[str]  # None while open and for a Swiss draw
    needs_doubles: bool  # KO tied 2:2 after the singles, no doubles game yet
    drop_doubles: bool   # a doubles game exists but the singles no longer stand at 2:2


def sets_to_win(best_of_sets: int) -> int:
    return best_of_sets // 2 + 1


def game_result(sets_a: int, sets_b: int, best_of_sets: int) -> GameResult:
    """Validates a final set count; 0:0 reopens the game. Raises ValueError with a German message."""
    if sets_a == 0 and sets_b == 0:
        return GameResult(0, 0, False, None)
    needed = sets_to_win(best_of_sets)
    if min(sets_a, sets_b) >= 0 and max(sets_a, sets_b) == needed and min(sets_a, sets_b) < needed:
        return GameResult(sets_a, sets_b, True, "A" if sets_a > sets_b else "B")
    raise ValueError(f"Ungültiges Ergebnis {sets_a}:{sets_b}. Gespielt wird auf {needed} Gewinnsätze.")


def _wins(games, side: str) -> int:
    return sum(1 for g in games if g.is_completed and g.winner_team_side == side)


def match_result(round_type: str, games: Sequence, singles_count: int = SWISS_SINGLES) -> MatchResult:
    """
    Recomputes a match from its games (objects with is_doubles, is_completed,
    winner_team_side, game_order), so corrections work both ways.
    singles_count is singles_per_match() of the tournament.
    """
    games = sorted(games, key=lambda g: g.game_order)
    singles = [g for g in games if not g.is_doubles]
    doubles = next((g for g in games if g.is_doubles), None)
    singles_a, singles_b = _wins(singles, "A"), _wins(singles, "B")

    if singles_count == 1:
        game = singles[0] if singles else None
        if game is None or not game.is_completed:
            return MatchResult(0, 0, False, None, needs_doubles=False, drop_doubles=False)
        return MatchResult(game.sets_won_a, game.sets_won_b, True, game.winner_team_side,
                           needs_doubles=False, drop_doubles=False)

    if round_type == "ko":
        tied = singles_a == 2 and singles_b == 2
        counted = games if tied else singles
        score_a, score_b = _wins(counted, "A"), _wins(counted, "B")
        winner = "A" if score_a >= KO_WINS_NEEDED else "B" if score_b >= KO_WINS_NEEDED else None
        return MatchResult(
            score_a, score_b, winner is not None, winner,
            needs_doubles=tied and doubles is None,
            drop_doubles=not tied and doubles is not None,
        )

    completed = len(singles) >= singles_count and all(g.is_completed for g in singles[:singles_count])
    winner = None
    if completed and singles_a != singles_b:
        winner = "A" if singles_a > singles_b else "B"
    return MatchResult(singles_a, singles_b, completed, winner, needs_doubles=False, drop_doubles=False)


def bye_result(singles_count: int = SWISS_SINGLES, best_of_sets: int = 5) -> MatchResult:
    """A bye counts as a match won without losing a game (in an Einzelturnier: without losing a set)."""
    score = sets_to_win(best_of_sets) if singles_count == 1 else singles_count
    return MatchResult(score, 0, True, "A", needs_doubles=False, drop_doubles=False)


def match_points(score_a: int, score_b: int, winner_side: Optional[str], singles_count: int) -> tuple[int, int]:
    """What a completed match adds to the standings' game points: the games won, or in an
    Einzelturnier (whose score is sets) 1 for the winner."""
    if singles_count != 1:
        return score_a, score_b
    return (1, 0) if winner_side == "A" else (0, 1) if winner_side == "B" else (0, 0)


def bye_sets(best_of_sets: int, singles_count: int = SWISS_SINGLES) -> int:
    """Sets credited for a bye: every single won without dropping a set."""
    return singles_count * sets_to_win(best_of_sets)
