import os
from datetime import UTC, datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Query, Session, relationship

from backend.app.database import Base


def default_admin_pin() -> str:
    """Admin PIN of a new tournament. Set TT_ADMIN_PIN on a public server, where admin123 is guessable."""
    return os.getenv("TT_ADMIN_PIN", "").strip() or "admin123"


class Tournament(Base):
    __tablename__ = "tournaments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC).replace(tzinfo=None))  # naive UTC
    is_active = Column(Boolean, default=True)

    # Tournament configuration
    swiss_rounds_count = Column(Integer, default=5)
    current_round_number = Column(Integer, default=0)
    ko_enabled = Column(Boolean, default=False)
    ko_teams_count = Column(Integer, default=4)  # 4 or 8
    best_of_sets = Column(Integer, default=5)     # 3 or 5
    table_count = Column(Integer, default=8)
    tables_per_match = Column(Integer, default=1)  # 1 or 2
    admin_pin = Column(String(20), default=default_admin_pin)

    teams = relationship("Team", back_populates="tournament", cascade="all, delete-orphan")
    rounds = relationship("Round", back_populates="tournament", cascade="all, delete-orphan")


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id"), nullable=False)
    name = Column(String(100), nullable=False)
    player1_name = Column(String(100), nullable=False)
    player2_name = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=True)  # False once deleted; kept for past matches

    tournament = relationship("Tournament", back_populates="teams")
    matches_as_a = relationship("TeamMatch", foreign_keys="TeamMatch.team_a_id", back_populates="team_a")
    matches_as_b = relationship("TeamMatch", foreign_keys="TeamMatch.team_b_id", back_populates="team_b")

    @staticmethod
    def active(db: Session, tournament_id: int) -> Query:
        """The teams taking part: listed, ranked and paired."""
        return db.query(Team).filter(Team.tournament_id == tournament_id, Team.is_active == True)


class Round(Base):
    __tablename__ = "rounds"

    id = Column(Integer, primary_key=True, index=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id"), nullable=False)
    round_number = Column(Integer, nullable=False)
    round_type = Column(String(20), default="swiss")  # "swiss" or "ko"
    ko_stage = Column(String(50), nullable=True)       # e.g. "Viertelfinale", "Halbfinale", "Finale"
    is_completed = Column(Boolean, default=False)
    is_active = Column(Boolean, default=False)

    tournament = relationship("Tournament", back_populates="rounds")
    team_matches = relationship("TeamMatch", back_populates="round", cascade="all, delete-orphan")


class TeamMatch(Base):
    __tablename__ = "team_matches"

    id = Column(Integer, primary_key=True, index=True)
    round_id = Column(Integer, ForeignKey("rounds.id"), nullable=False)
    team_a_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    team_b_id = Column(Integer, ForeignKey("teams.id"), nullable=True)  # None: bye (Swiss)
    
    table_number = Column(Integer, nullable=True)
    table_number_b = Column(Integer, nullable=True)  # if 2 tables assigned

    # Lineup for this match (Position 1 and 2 of Team A and Team B)
    team_a_p1_name = Column(String(100), nullable=True)
    team_a_p2_name = Column(String(100), nullable=True)
    team_b_p1_name = Column(String(100), nullable=True)
    team_b_p2_name = Column(String(100), nullable=True)
    lineup_confirmed = Column(Boolean, default=False)

    # Score of individual games won (e.g. 4-0, 3-1, 2-2 in swiss, or 3-2 in KO)
    score_a = Column(Integer, default=0)
    score_b = Column(Integer, default=0)
    is_completed = Column(Boolean, default=False)
    winner_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)

    # KO progression
    ko_slot = Column(Integer, nullable=True)
    next_match_id = Column(Integer, ForeignKey("team_matches.id"), nullable=True)

    round = relationship("Round", back_populates="team_matches")
    team_a = relationship("Team", foreign_keys=[team_a_id], back_populates="matches_as_a")
    team_b = relationship("Team", foreign_keys=[team_b_id], back_populates="matches_as_b")
    individual_games = relationship(
        "IndividualGame",
        back_populates="team_match",
        cascade="all, delete-orphan",
        order_by="IndividualGame.game_order",
    )

    @property
    def is_bye(self) -> bool:
        return self.team_b_id is None


class IndividualGame(Base):
    __tablename__ = "individual_games"

    id = Column(Integer, primary_key=True, index=True)
    team_match_id = Column(Integer, ForeignKey("team_matches.id"), nullable=False)
    game_order = Column(Integer, nullable=False)  # see match_sheet.SINGLES; 5: deciding doubles (KO)
    is_doubles = Column(Boolean, default=False)
    table_number = Column(Integer, nullable=True)

    player_a_name = Column(String(100), nullable=True)
    player_b_name = Column(String(100), nullable=True)

    sets_won_a = Column(Integer, default=0)
    sets_won_b = Column(Integer, default=0)
    is_completed = Column(Boolean, default=False)
    winner_team_side = Column(String(1), nullable=True)  # "A" or "B"

    team_match = relationship("TeamMatch", back_populates="individual_games")

