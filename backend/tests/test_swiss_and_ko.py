import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.database import Base
from backend.app.match_sheet import add_deciding_doubles
from backend.app.models import Round, Team, TeamMatch, Tournament
from backend.app.progression import start_ko
from backend.app.swiss_system import (
    calculate_standings,
    generate_swiss_round_pairings,
)


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_swiss_system_and_buchholz(db_session):
    # 1. Create Tournament
    t = Tournament(name="Test Turnier", swiss_rounds_count=3, best_of_sets=5)
    db_session.add(t)
    db_session.commit()

    # 2. Add 4 Teams
    teams = []
    for i in range(1, 5):
        team = Team(
            tournament_id=t.id,
            name=f"Team {i}",
            player1_name=f"P{i}A",
            player2_name=f"P{i}B"
        )
        db_session.add(team)
        teams.append(team)
    db_session.commit()

    # 3. Generate Round 1 pairings
    pairings = generate_swiss_round_pairings(t.id, db_session)
    assert len(pairings) == 2

    # Simulate Round 1 results:
    r1 = Round(tournament_id=t.id, round_number=1, round_type="swiss", is_completed=True)
    db_session.add(r1)
    db_session.commit()

    # Team 1 plays Team 2 (Team 1 wins 4:0)
    m1 = TeamMatch(
        round_id=r1.id, team_a_id=teams[0].id, team_b_id=teams[1].id,
        score_a=4, score_b=0, is_completed=True, winner_team_id=teams[0].id
    )
    # Team 3 plays Team 4 (Team 3 wins 3:1)
    m2 = TeamMatch(
        round_id=r1.id, team_a_id=teams[2].id, team_b_id=teams[3].id,
        score_a=3, score_b=1, is_completed=True, winner_team_id=teams[2].id
    )
    db_session.add_all([m1, m2])
    db_session.commit()

    # 4. Check standings
    standings = calculate_standings(t.id, db_session)
    assert standings[0]["team_id"] == teams[0].id  # 4 points
    assert standings[1]["team_id"] == teams[2].id  # 3 points
    assert standings[2]["team_id"] == teams[3].id  # 1 point
    assert standings[3]["team_id"] == teams[1].id  # 0 points

    # 5. Round 2 pairings must pair winners against winners (Team 1 vs Team 3) and losers (Team 4 vs Team 2)
    # and strictly prevent rematch between Team 1 and Team 2!
    r2_pairings = generate_swiss_round_pairings(t.id, db_session)
    pair1 = (min(r2_pairings[0]), max(r2_pairings[0]))
    pair2 = (min(r2_pairings[1]), max(r2_pairings[1]))

    assert (teams[0].id, teams[1].id) not in [pair1, pair2], "Rematch must not happen!"
    assert (teams[0].id, teams[2].id) in [pair1, pair2], "Team 1 and Team 3 should play!"


def test_odd_teams_bye_handling(db_session):
    t = Tournament(name="Odd Teams Turnier")
    db_session.add(t)
    db_session.commit()

    # Add 3 Teams (odd count)
    for i in range(1, 4):
        db_session.add(Team(tournament_id=t.id, name=f"Team {i}", player1_name=f"P{i}A", player2_name=f"P{i}B"))
    db_session.commit()

    pairings = generate_swiss_round_pairings(t.id, db_session)
    assert len(pairings) == 2  # 1 regular pair + 1 bye pair
    bye_pair = [p for p in pairings if p[1] is None]
    assert len(bye_pair) == 1


def test_ko_phase_and_deciding_doubles(db_session):
    t = Tournament(name="KO Test", swiss_rounds_count=1, best_of_sets=5)
    db_session.add(t)
    db_session.commit()

    teams = []
    for i in range(1, 5):
        team = Team(tournament_id=t.id, name=f"Team {i}", player1_name=f"P{i}A", player2_name=f"P{i}B")
        db_session.add(team)
        teams.append(team)
    db_session.commit()

    # Simulate preliminary round
    r1 = Round(tournament_id=t.id, round_number=1, round_type="swiss", is_completed=True)
    db_session.add(r1)
    db_session.flush()

    db_session.add(
        TeamMatch(round_id=r1.id, team_a_id=teams[0].id, team_b_id=teams[1].id, score_a=4, score_b=0, is_completed=True)
    )
    db_session.add(
        TeamMatch(round_id=r1.id, team_a_id=teams[2].id, team_b_id=teams[3].id, score_a=3, score_b=1, is_completed=True)
    )
    db_session.commit()

    # Generate KO Phase (Top 4)
    ko_round = start_ko(t, 4, db_session)
    assert ko_round.round_type == "ko"
    assert len(ko_round.team_matches) == 2

    # Check setup of 4 games for match
    match1 = ko_round.team_matches[0]
    assert len(match1.individual_games) == 4
    assert match1.individual_games[0].game_order == 1
    assert match1.individual_games[1].game_order == 2
    assert match1.individual_games[2].game_order == 3
    assert match1.individual_games[3].game_order == 4

    # Test Deciding Doubles on 2:2
    doubles_game = add_deciding_doubles(match1, db_session)
    assert doubles_game.game_order == 5
    assert doubles_game.is_doubles == True
