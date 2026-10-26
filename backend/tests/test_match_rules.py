from types import SimpleNamespace

import pytest

from backend.app import match_rules
from backend.app.match_rules import MatchResult


def game(order, winner, is_doubles=False):
    return SimpleNamespace(game_order=order, is_doubles=is_doubles, is_completed=winner != ".",
                           winner_team_side=None if winner == "." else winner)


def games(winners, doubles=None):
    """Games from a string like "AB.A" (winner side per single, "." = open), plus an optional doubles."""
    gs = [game(i, w) for i, w in enumerate(winners, start=1)]
    if doubles is not None:
        gs.append(game(5, doubles, is_doubles=True))
    return gs


@pytest.mark.parametrize("best_of,needed", [(3, 2), (5, 3)])
def test_sets_to_win(best_of, needed):
    assert match_rules.sets_to_win(best_of) == needed


@pytest.mark.parametrize("a,b,best_of,expected", [
    (3, 1, 5, (3, 1, True, "A")),
    (2, 3, 5, (2, 3, True, "B")),
    (2, 0, 3, (2, 0, True, "A")),
    (0, 0, 5, (0, 0, False, None)),
])
def test_valid_game_results(a, b, best_of, expected):
    assert tuple(match_rules.game_result(a, b, best_of)) == expected


@pytest.mark.parametrize("a,b,best_of", [(3, 0, 3), (2, 2, 3), (3, 3, 5), (4, 0, 5), (-1, 3, 5)])
def test_invalid_game_results(a, b, best_of):
    with pytest.raises(ValueError, match=f"{match_rules.sets_to_win(best_of)} Gewinnsätze"):
        match_rules.game_result(a, b, best_of)


@pytest.mark.parametrize("winners,expected", [
    ("AAAA", MatchResult(4, 0, True, "A", False, False)),
    ("ABBB", MatchResult(1, 3, True, "B", False, False)),
    ("ABAB", MatchResult(2, 2, True, None, False, False)),
    ("AAA.", MatchResult(3, 0, False, None, False, False)),
])
def test_swiss_match_needs_all_four_singles_and_may_draw(winners, expected):
    assert match_rules.match_result("swiss", games(winners)) == expected


@pytest.mark.parametrize("winners,doubles,expected", [
    ("AAA.", None, MatchResult(3, 0, True, "A", False, False)),
    ("ABA.", None, MatchResult(2, 1, False, None, False, False)),
    ("ABAB", None, MatchResult(2, 2, False, None, True, False)),
    ("ABAB", ".", MatchResult(2, 2, False, None, False, False)),
    ("ABAB", "B", MatchResult(2, 3, True, "B", False, False)),
    # A corrected single broke the 2:2: the doubles no longer counts and goes
    ("AAAB", "B", MatchResult(3, 1, True, "A", False, True)),
])
def test_ko_match_ends_at_three_wins_with_deciding_doubles(winners, doubles, expected):
    assert match_rules.match_result("ko", games(winners, doubles)) == expected


@pytest.mark.parametrize("best_of,sets", [(3, 8), (5, 12)])
def test_bye(best_of, sets):
    assert match_rules.bye_result() == MatchResult(4, 0, True, "A", False, False)
    assert match_rules.bye_sets(best_of) == sets
