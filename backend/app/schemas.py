from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class TeamBase(BaseModel):
    name: str
    player1_name: str
    player2_name: str


class TeamCreate(TeamBase):
    pass


class TeamResponse(TeamBase):
    id: int
    tournament_id: int
    is_active: bool
    is_bye: bool

    model_config = ConfigDict(from_attributes=True)


class TournamentBase(BaseModel):
    name: str
    swiss_rounds_count: int = 5
    ko_enabled: bool = False
    ko_teams_count: int = 4
    best_of_sets: int = 5
    points_per_set: int = 11
    table_count: int = 8
    tables_per_match: int = 1


class TournamentCreate(TournamentBase):
    admin_pin: str = "admin123"


class TournamentUpdate(BaseModel):
    name: Optional[str] = None
    swiss_rounds_count: Optional[int] = None
    ko_enabled: Optional[bool] = None
    ko_teams_count: Optional[int] = None
    best_of_sets: Optional[int] = None
    table_count: Optional[int] = None
    tables_per_match: Optional[int] = None
    admin_pin: Optional[str] = None


class TournamentResponse(TournamentBase):
    id: int
    is_active: bool
    current_round_number: int

    model_config = ConfigDict(from_attributes=True)


class SetScoreSchema(BaseModel):
    set_number: int
    score_a: int
    score_b: int
    is_completed: bool

    model_config = ConfigDict(from_attributes=True)


class IndividualGameResponse(BaseModel):
    id: int
    team_match_id: int
    game_order: int
    is_doubles: bool
    table_number: Optional[int] = None
    player_a_name: Optional[str] = None
    player_b_name: Optional[str] = None
    sets_won_a: int
    sets_won_b: int
    is_completed: bool
    winner_team_side: Optional[str] = None
    current_set_index: int
    current_point_a: int
    current_point_b: int
    set_scores: List[SetScoreSchema] = []

    model_config = ConfigDict(from_attributes=True)


class TeamMatchResponse(BaseModel):
    id: int
    round_id: int
    team_a_id: int
    team_b_id: Optional[int] = None
    team_a: Optional[TeamResponse] = None
    team_b: Optional[TeamResponse] = None
    table_number: Optional[int] = None
    table_number_b: Optional[int] = None
    match_pin: str
    team_a_p1_name: Optional[str] = None
    team_a_p2_name: Optional[str] = None
    team_b_p1_name: Optional[str] = None
    team_b_p2_name: Optional[str] = None
    lineup_confirmed: bool
    score_a: int
    score_b: int
    is_completed: bool
    winner_team_id: Optional[int] = None
    ko_slot: Optional[int] = None
    individual_games: List[IndividualGameResponse] = []

    model_config = ConfigDict(from_attributes=True)


class RoundResponse(BaseModel):
    id: int
    tournament_id: int
    round_number: int
    round_type: str
    ko_stage: Optional[str] = None
    is_completed: bool
    is_active: bool
    team_matches: List[TeamMatchResponse] = []

    model_config = ConfigDict(from_attributes=True)


class LineupUpdate(BaseModel):
    team_a_p1_name: str
    team_a_p2_name: str
    team_b_p1_name: str
    team_b_p2_name: str


class PointUpdate(BaseModel):
    point_a: int
    point_b: int
    set_number: int


class SetResultUpdate(BaseModel):
    set_number: int
    score_a: int
    score_b: int


class QuickGameResult(BaseModel):
    sets: List[SetResultUpdate]  # e.g. [{"set_number": 1, "score_a": 11, "score_b": 9}, ...]


class StandingsRow(BaseModel):
    rank: int
    team_id: int
    team_name: str
    player1: str
    player2: str
    matches_played: int
    won_matches: int
    drawn_matches: int
    lost_matches: int
    game_points: int       # Won individual games (e.g. 4, 3, 2)
    game_points_lost: int  # Lost individual games
    buchholz: float        # Sum of opponents' game_points
    sets_won: int
    sets_lost: int
    set_diff: int
    balls_won: int
    balls_lost: int
    ball_diff: int


class TableStatusResponse(BaseModel):
    table_number: int
    pin_code: str
    current_team_match_id: Optional[int] = None
    team_a_name: Optional[str] = None
    team_b_name: Optional[str] = None
    active_game_desc: Optional[str] = None
    current_point_a: int = 0
    current_point_b: int = 0
    sets_won_a: int = 0
    sets_won_b: int = 0
    set_scores_summary: str = ""
    is_active: bool = False
