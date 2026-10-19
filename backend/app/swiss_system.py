import random
from typing import Dict, List, Optional, Set, Tuple

from sqlalchemy.orm import Session

from backend.app.models import IndividualGame, Round, Team, TeamMatch


def calculate_standings(tournament_id: int, db: Session) -> List[Dict]:
    teams = db.query(Team).filter(
        Team.tournament_id == tournament_id,
        Team.is_active == True,
        Team.is_bye == False
    ).all()

    # Initialize statistics for each team
    stats = {}
    opponents_map: Dict[int, List[int]] = {}

    for t in teams:
        stats[t.id] = {
            "rank": 0,
            "team_id": t.id,
            "team_name": t.name,
            "player1": t.player1_name,
            "player2": t.player2_name,
            "matches_played": 0,
            "won_matches": 0,
            "drawn_matches": 0,
            "lost_matches": 0,
            "game_points": 0,       # Individual matches won (e.g. 4, 3, 2)
            "game_points_lost": 0,  # Individual matches lost
            "buchholz": 0.0,
            "sets_won": 0,
            "sets_lost": 0,
            "set_diff": 0,
        }
        opponents_map[t.id] = []

    # Get all completed team matches in swiss rounds
    matches = db.query(TeamMatch).join(Round).filter(
        Round.tournament_id == tournament_id,
        Round.round_type == "swiss",
        TeamMatch.is_completed == True
    ).all()

    for m in matches:
        a_id = m.team_a_id
        b_id = m.team_b_id

        # BYE match handling (team_b_id is None)
        if b_id is None:
            if a_id in stats:
                stats[a_id]["matches_played"] += 1
                stats[a_id]["won_matches"] += 1
                stats[a_id]["game_points"] += m.score_a
                stats[a_id]["game_points_lost"] += m.score_b
                stats[a_id]["sets_won"] += 12
                stats[a_id]["sets_lost"] += 0
            continue

        if a_id in stats and b_id in stats:
            stats[a_id]["matches_played"] += 1
            stats[b_id]["matches_played"] += 1
            opponents_map[a_id].append(b_id)
            opponents_map[b_id].append(a_id)

            stats[a_id]["game_points"] += m.score_a
            stats[a_id]["game_points_lost"] += m.score_b
            stats[b_id]["game_points"] += m.score_b
            stats[b_id]["game_points_lost"] += m.score_a

            if m.score_a > m.score_b:
                stats[a_id]["won_matches"] += 1
                stats[b_id]["lost_matches"] += 1
            elif m.score_b > m.score_a:
                stats[b_id]["won_matches"] += 1
                stats[a_id]["lost_matches"] += 1
            else:
                stats[a_id]["drawn_matches"] += 1
                stats[b_id]["drawn_matches"] += 1

            # Accumulate sets from individual games
            for g in m.individual_games:
                stats[a_id]["sets_won"] += g.sets_won_a
                stats[a_id]["sets_lost"] += g.sets_won_b
                stats[b_id]["sets_won"] += g.sets_won_b
                stats[b_id]["sets_lost"] += g.sets_won_a

    # Calculate Buchholz score (sum of game_points of all opponents played)
    for team_id, opp_list in opponents_map.items():
        buchholz_sum = sum(stats[opp_id]["game_points"] for opp_id in opp_list if opp_id in stats)
        stats[team_id]["buchholz"] = float(buchholz_sum)
        stats[team_id]["set_diff"] = stats[team_id]["sets_won"] - stats[team_id]["sets_lost"]

    # Sort standings:
    # 1. game_points (descending)
    # 2. buchholz (descending)
    # 3. set_diff (descending)
    sorted_teams = sorted(
        stats.values(),
        key=lambda x: (x["game_points"], x["buchholz"], x["set_diff"]),
        reverse=True
    )

    for idx, row in enumerate(sorted_teams):
        row["rank"] = idx + 1

    return sorted_teams


def get_played_pairings(tournament_id: int, db: Session) -> Set[Tuple[int, int]]:
    matches = db.query(TeamMatch).join(Round).filter(
        Round.tournament_id == tournament_id,
        TeamMatch.team_b_id.isnot(None)
    ).all()
    
    played = set()
    for m in matches:
        pair = (min(m.team_a_id, m.team_b_id), max(m.team_a_id, m.team_b_id))
        played.add(pair)
    return played


def get_teams_with_bye(tournament_id: int, db: Session) -> Set[int]:
    bye_matches = db.query(TeamMatch).join(Round).filter(
        Round.tournament_id == tournament_id,
        TeamMatch.team_b_id.is_(None)
    ).all()
    return {m.team_a_id for m in bye_matches}


def pair_teams_backtrack(
    team_ids: List[int],
    played_pairs: Set[Tuple[int, int]]
) -> Optional[List[Tuple[int, int]]]:
    """
    Backtracking pairing algorithm for Swiss system with strict rematch avoidance.
    team_ids is sorted by rank.
    """
    if not team_ids:
        return []

    first = team_ids[0]
    rest = team_ids[1:]

    for i, opponent in enumerate(rest):
        pair = (min(first, opponent), max(first, opponent))
        if pair not in played_pairs:
            remaining = rest[:i] + rest[i+1:]
            sub_solution = pair_teams_backtrack(remaining, played_pairs)
            if sub_solution is not None:
                return [(first, opponent)] + sub_solution

    return None


def generate_swiss_round_pairings(tournament_id: int, db: Session) -> List[Tuple[int, Optional[int]]]:
    """
    Generates pairings for the next Swiss round.
    Returns list of (team_a_id, team_b_id).
    If odd number of teams, one team gets (team_id, None) for BYE.
    """
    standings = calculate_standings(tournament_id, db)
    played_pairs = get_played_pairings(tournament_id, db)
    teams_with_bye = get_teams_with_bye(tournament_id, db)

    ordered_team_ids = [s["team_id"] for s in standings]

    # Handle odd number of teams
    bye_pair = None
    if len(ordered_team_ids) % 2 != 0:
        # Give bye to lowest ranked team that hasn't had a bye yet
        bye_candidate = None
        for team_id in reversed(ordered_team_ids):
            if team_id not in teams_with_bye:
                bye_candidate = team_id
                break
        
        # If all teams had a bye (rare in short tournaments), pick the lowest ranked
        if bye_candidate is None:
            bye_candidate = ordered_team_ids[-1]

        ordered_team_ids.remove(bye_candidate)
        bye_pair = (bye_candidate, None)

    # First round: If round 1, shuffle or pair top half vs bottom half / adjacent
    matches_count = db.query(TeamMatch).join(Round).filter(
        Round.tournament_id == tournament_id
    ).count()

    pairings = None
    if matches_count == 0:
        # Round 1: Randomize team seeds or pair top half vs bottom half
        shuffled = list(ordered_team_ids)
        random.shuffle(shuffled)
        pairings = [(shuffled[i], shuffled[i+1]) for i in range(0, len(shuffled), 2)]
    else:
        # Standard Swiss pairing with backtracking
        pairings = pair_teams_backtrack(ordered_team_ids, played_pairs)
        
        # Fallback if strict rematch avoidance is mathematically impossible
        if pairings is None:
            pairings = [(ordered_team_ids[i], ordered_team_ids[i+1]) for i in range(0, len(ordered_team_ids), 2)]

    if bye_pair:
        pairings.append(bye_pair)

    return pairings


def setup_games_for_match(match: TeamMatch, db: Session):
    """
    Creates the 4 standard individual games for a 2-player team match.
    Game 1: A1 vs B2 (Over-cross)
    Game 2: A2 vs B1 (Over-cross)
    Game 3: A1 vs B1 (Direct)
    Game 4: A2 vs B2 (Direct)
    """
    p_a1 = match.team_a_p1_name or (match.team_a.player1_name if match.team_a else "Spieler A1")
    p_a2 = match.team_a_p2_name or (match.team_a.player2_name if match.team_a else "Spieler A2")
    p_b1 = match.team_b_p1_name or (match.team_b.player1_name if match.team_b else "Spieler B1")
    p_b2 = match.team_b_p2_name or (match.team_b.player2_name if match.team_b else "Spieler B2")

    games_data = [
        (1, False, p_a1, p_b2, match.table_number),
        (2, False, p_a2, p_b1, match.table_number_b or match.table_number),
        (3, False, p_a1, p_b1, match.table_number),
        (4, False, p_a2, p_b2, match.table_number_b or match.table_number),
    ]

    for order, is_doubles, p_a, p_b, tbl in games_data:
        game = IndividualGame(
            team_match_id=match.id,
            game_order=order,
            is_doubles=is_doubles,
            player_a_name=p_a,
            player_b_name=p_b,
            table_number=tbl,
        )
        db.add(game)


def add_deciding_doubles_game(match: TeamMatch, db: Session):
    """
    Creates the 5th game (Entscheidungsdoppel) for KO matches tied at 2:2.
    """
    existing_doubles = db.query(IndividualGame).filter(
        IndividualGame.team_match_id == match.id,
        IndividualGame.game_order == 5
    ).first()
    if existing_doubles:
        return existing_doubles

    p_a = f"{match.team_a.player1_name} / {match.team_a.player2_name}"
    p_b = f"{match.team_b.player1_name} / {match.team_b.player2_name}"

    game = IndividualGame(
        team_match_id=match.id,
        game_order=5,
        is_doubles=True,
        player_a_name=p_a,
        player_b_name=p_b,
        table_number=match.table_number,
    )
    db.add(game)
    db.flush()
    return game
