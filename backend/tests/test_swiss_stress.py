"""Randomized stress test for the Swiss pairing.

Plays a full round robin (n-1 rounds for even n, n rounds for odd n, so every
team gets exactly one bye) through generate_swiss_round_pairings with random
results, and checks after every round that the draw is valid and no pairing
repeats.
"""
import random

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app import swiss_system
from backend.app.database import Base
from backend.app.models import IndividualGame, Round, Team, TeamMatch, Tournament
from backend.app.swiss_system import generate_swiss_round_pairings, pair_round_with_lookahead

TEAM_COUNTS = range(4, 17)
SEEDS = range(20)


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


def _record_round(db, t_id, round_number, pairings, rng):
    rnd = Round(tournament_id=t_id, round_number=round_number, round_type="swiss", is_completed=True)
    db.add(rnd)
    db.flush()
    for a_id, b_id in pairings:
        if b_id is None:
            db.add(TeamMatch(round_id=rnd.id, team_a_id=a_id, score_a=4, score_b=0, is_completed=True))
            continue
        # Random 4-singles result, draws (2:2) included
        game_winners = [rng.choice("AB") for _ in range(4)]
        score_a = game_winners.count("A")
        match = TeamMatch(
            round_id=rnd.id, team_a_id=a_id, team_b_id=b_id,
            score_a=score_a, score_b=4 - score_a, is_completed=True,
        )
        db.add(match)
        db.flush()
        for order, side in enumerate(game_winners, start=1):
            loser_sets = rng.randint(0, 2)
            db.add(IndividualGame(
                team_match_id=match.id, game_order=order, is_completed=True, winner_team_side=side,
                sets_won_a=3 if side == "A" else loser_sets,
                sets_won_b=3 if side == "B" else loser_sets,
            ))
    db.commit()


@pytest.mark.parametrize("seed", SEEDS)
@pytest.mark.parametrize("n_teams", TEAM_COUNTS)
def test_full_round_robin_without_rematches(db_session, n_teams, seed):
    rng = random.Random(seed)
    random.seed(seed)  # round 1 uses the module-level random.shuffle

    t = Tournament(name="Stress", swiss_rounds_count=n_teams)
    db_session.add(t)
    db_session.commit()
    for i in range(n_teams):
        db_session.add(Team(tournament_id=t.id, name=f"T{i}", player1_name=f"P{i}A", player2_name=f"P{i}B"))
    db_session.commit()
    team_ids = {tm.id for tm in db_session.query(Team).filter(Team.tournament_id == t.id)}

    max_rounds = n_teams - 1 if n_teams % 2 == 0 else n_teams
    played = set()
    byes = set()

    for round_number in range(1, max_rounds + 1):
        pairings = generate_swiss_round_pairings(t.id, db_session)
        ctx = f"{n_teams} teams, seed {seed}, round {round_number}/{max_rounds}"

        # Every team appears exactly once
        seen = [tid for pair in pairings for tid in pair if tid is not None]
        assert sorted(seen) == sorted(team_ids), ctx

        bye_teams = [a for a, b in pairings if b is None]
        assert len(bye_teams) == n_teams % 2, ctx
        for bye_team in bye_teams:
            assert bye_team not in byes, f"{ctx}: second bye for team {bye_team}"
            byes.add(bye_team)

        for a, b in pairings:
            if b is None:
                continue
            pair = (min(a, b), max(a, b))
            assert pair not in played, f"{ctx}: rematch {pair}"
            played.add(pair)

        _record_round(db_session, t.id, round_number, pairings, rng)

    # Everyone has played everyone
    assert len(played) == n_teams * (n_teams - 1) // 2


def _all_pairs(team_ids):
    return {(a, b) for a in team_ids for b in team_ids if a < b}


def test_lookahead_avoids_odd_cycle():
    # 6 teams after 2 rounds: the greedy top-down pairing (1-2, 3-4, 5-6) would
    # leave two triangles (1-3-5, 2-4-6) open, so the last two rounds can't be drawn.
    played = {(1, 4), (2, 5), (3, 6), (1, 6), (2, 3), (4, 5)}
    pairing = pair_round_with_lookahead([1, 2, 3, 4, 5, 6], played, future_rounds=2)
    assert pairing is not None
    assert pairing != [(1, 2), (3, 4), (5, 6)]
    for a, b in pairing:
        assert (min(a, b), max(a, b)) not in played


def test_lookahead_falls_back_when_too_many_rounds_requested():
    # 4 teams can't play 5 more rounds; the current round is still rematch-free
    pairing = pair_round_with_lookahead([1, 2, 3, 4], set(), future_rounds=5)
    assert pairing == [(1, 2), (3, 4)]


def test_lookahead_falls_back_when_budget_runs_out(monkeypatch):
    monkeypatch.setattr(swiss_system, "LOOKAHEAD_BUDGET", 1)
    pairing = pair_round_with_lookahead(list(range(1, 9)), set(), future_rounds=6)
    assert pairing == [(1, 2), (3, 4), (5, 6), (7, 8)]


def test_lookahead_returns_none_when_rematch_unavoidable():
    assert pair_round_with_lookahead([1, 2, 3, 4], _all_pairs([1, 2, 3, 4]), future_rounds=0) is None


def test_more_rounds_than_opponents_pairs_neighbours(db_session):
    t = Tournament(name="Zu viele Runden", swiss_rounds_count=5)
    db_session.add(t)
    db_session.commit()
    for i in range(3):
        db_session.add(Team(tournament_id=t.id, name=f"T{i}", player1_name="A", player2_name="B"))
    db_session.commit()

    rng = random.Random(0)
    for round_number in range(1, 4):
        _record_round(db_session, t.id, round_number, generate_swiss_round_pairings(t.id, db_session), rng)

    # Round 4 of 3 possible: a rematch is unavoidable, but the draw still works
    pairings = generate_swiss_round_pairings(t.id, db_session)
    assert len(pairings) == 2
    assert sum(1 for _, b in pairings if b is None) == 1
