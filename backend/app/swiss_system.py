import random
from typing import Dict, FrozenSet, Iterator, List, Optional, Set, Tuple

from sqlalchemy.orm import Session

from backend.app.models import IndividualGame, Round, Team, TeamMatch, Tournament


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


# Stand-in opponent for the bye: with an odd team count, BYE joins the draw as
# an extra team, so "every team gets at most one bye" is just another rematch
# to avoid, and the look-ahead plans the byes along with the matches.
BYE = -1

# Upper bound on search steps per look-ahead depth. Only reached when the
# history no longer fits a round robin (manual swaps, teams added or
# deactivated mid-tournament); the search then retries with less look-ahead.
LOOKAHEAD_BUDGET = 200_000


class _BudgetExceeded(Exception):
    pass


def _pair_key(a: int, b: int) -> Tuple[int, int]:
    return (min(a, b), max(a, b))


def _ranked_pairings(
    team_ids: List[int],
    played_pairs: Set[Tuple[int, int]]
) -> Iterator[List[Tuple[int, int]]]:
    """
    Yields every rematch-free pairing of team_ids (sorted by rank), most
    preferred first: the highest ranked team meets the next highest ranked
    team it hasn't played yet.
    """
    if not team_ids:
        yield []
        return

    first = team_ids[0]
    rest = team_ids[1:]
    for i, opponent in enumerate(rest):
        if _pair_key(first, opponent) not in played_pairs:
            for sub in _ranked_pairings(rest[:i] + rest[i+1:], played_pairs):
                yield [(first, opponent)] + sub


def _round_candidates(
    team_ids: List[int],
    played_pairs: Set[Tuple[int, int]]
) -> Iterator[List[Tuple[int, int]]]:
    """Like _ranked_pairings, but the bye goes to the lowest ranked team possible."""
    if BYE not in team_ids:
        yield from _ranked_pairings(team_ids, played_pairs)
        return

    teams = [t for t in team_ids if t != BYE]
    for bye_team in reversed(teams):
        if _pair_key(bye_team, BYE) not in played_pairs:
            rest = [t for t in teams if t != bye_team]
            for sub in _ranked_pairings(rest, played_pairs):
                yield sub + [(bye_team, BYE)]


def _can_split_into_rounds(
    open_pairs: FrozenSet[Tuple[int, int]],
    rounds: int,
    failed: Set[Tuple[FrozenSet[Tuple[int, int]], int]],
    budget: List[int]
) -> bool:
    """True if `rounds` more complete, rematch-free rounds can be drawn from open_pairs."""
    if rounds == 0:
        return True
    if (open_pairs, rounds) in failed:
        return False

    neighbours: Dict[int, Set[int]] = {}
    for a, b in open_pairs:
        neighbours.setdefault(a, set()).add(b)
        neighbours.setdefault(b, set()).add(a)

    def pair_up(unpaired: FrozenSet[int], chosen: List[Tuple[int, int]]) -> bool:
        budget[0] -= 1
        if budget[0] < 0:
            raise _BudgetExceeded()
        if not unpaired:
            return _can_split_into_rounds(open_pairs.difference(chosen), rounds - 1, failed, budget)
        # Most constrained team first keeps the search small
        team = min(unpaired, key=lambda t: (len(neighbours[t] & unpaired), t))
        for opponent in sorted(neighbours[team] & unpaired):
            chosen.append(_pair_key(team, opponent))
            if pair_up(unpaired - {team, opponent}, chosen):
                return True
            chosen.pop()
        return False

    # Every team needs an open opponent in each of the remaining rounds
    if all(len(n) >= rounds for n in neighbours.values()) and pair_up(frozenset(neighbours), []):
        return True
    failed.add((open_pairs, rounds))
    return False


def pair_round_with_lookahead(
    team_ids: List[int],
    played_pairs: Set[Tuple[int, int]],
    future_rounds: int
) -> Optional[List[Tuple[int, int]]]:
    """
    Pairs team_ids (sorted by rank, even count, may contain BYE) without
    rematches, such that `future_rounds` more rematch-free rounds remain
    possible afterwards. Drawing each round greedily paints itself into a
    corner: two rounds before the end of a round robin the open pairs form
    cycles, and an odd cycle can't be paired.

    Falls back to less look-ahead if the full one can't be met (or the search
    runs out of budget); None means this round itself can't avoid a rematch.
    """
    open_pairs = frozenset(
        _pair_key(a, b) for i, a in enumerate(team_ids) for b in team_ids[i+1:]
    ) - played_pairs

    for lookahead in range(future_rounds, -1, -1):
        failed: Set[Tuple[FrozenSet[Tuple[int, int]], int]] = set()
        budget = [LOOKAHEAD_BUDGET]
        try:
            for pairing in _round_candidates(team_ids, played_pairs):
                rest = open_pairs.difference(_pair_key(a, b) for a, b in pairing)
                if _can_split_into_rounds(rest, lookahead, failed, budget):
                    return pairing
        except _BudgetExceeded:
            continue
        if lookahead == 0:
            break
    return None


def generate_swiss_round_pairings(tournament_id: int, db: Session) -> List[Tuple[int, Optional[int]]]:
    """
    Generates pairings for the next Swiss round.
    Returns list of (team_a_id, team_b_id).
    If odd number of teams, one team gets (team_id, None) for BYE.
    """
    standings = calculate_standings(tournament_id, db)
    played_pairs = get_played_pairings(tournament_id, db)
    played_pairs |= {_pair_key(t, BYE) for t in get_teams_with_bye(tournament_id, db)}

    ordered_team_ids = [s["team_id"] for s in standings]

    swiss_rounds_played = db.query(Round).filter(
        Round.tournament_id == tournament_id,
        Round.round_type == "swiss"
    ).count()
    if swiss_rounds_played == 0:
        # Round 1: random draw
        random.shuffle(ordered_team_ids)

    if len(ordered_team_ids) % 2 != 0:
        ordered_team_ids.append(BYE)

    tournament = db.get(Tournament, tournament_id)
    future_rounds = max(0, min(
        tournament.swiss_rounds_count - swiss_rounds_played - 1,
        # A round robin is over after (team count - 1) rounds, BYE included
        len(ordered_team_ids) - 2 - swiss_rounds_played,
    ))

    pairings = pair_round_with_lookahead(ordered_team_ids, played_pairs, future_rounds)

    if pairings is None:
        # A rematch is unavoidable (more rounds than opponents): pair neighbours
        pairings = [(ordered_team_ids[i], ordered_team_ids[i+1]) for i in range(0, len(ordered_team_ids), 2)]

    return [(b, None) if a == BYE else (a, None if b == BYE else b) for a, b in pairings]


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
