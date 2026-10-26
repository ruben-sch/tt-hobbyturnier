"""
The archive PDF of a tournament: final standings, KO phase and every round
with its matches and games. Built from the database alone, read-only.
"""
from datetime import datetime
from typing import List, Optional

from fpdf import FPDF
from fpdf.fonts import FontFace
from sqlalchemy.orm import Session

from backend.app.models import Round, TeamMatch, Tournament
from backend.app.swiss_system import calculate_standings

HEADER = FontFace(emphasis="BOLD", fill_color=(226, 232, 240))
WINNER = FontFace(emphasis="BOLD")
MATCH = FontFace(emphasis="BOLD", fill_color=(241, 245, 249))


def _text(value: object) -> str:
    """The core PDF fonts only know Latin-1; anything else becomes '?' instead of failing."""
    return str(value).encode("latin-1", "replace").decode("latin-1")


def _team_name(match: TeamMatch, side: str) -> str:
    team = match.team_a if side == "A" else match.team_b
    if team is None:
        return "Freilos"
    return team.name


def _game_label(game) -> str:
    return "Doppel" if game.is_doubles else f"Einzel {game.game_order}"


def _round_title(round_obj: Round) -> str:
    if round_obj.round_type == "ko":
        return f"Runde {round_obj.round_number}: {round_obj.ko_stage} (KO)"
    return f"Runde {round_obj.round_number} (Schweizer System)"


def _champion(rounds: List[Round]) -> Optional[str]:
    final = next((r for r in rounds if r.round_type == "ko" and r.ko_stage == "Finale"), None)
    if not final or not final.team_matches:
        return None
    match = final.team_matches[0]
    if not match.is_completed or match.winner_team_id is None:
        return None
    return _team_name(match, "A" if match.winner_team_id == match.team_a_id else "B")


class _ArchivePdf(FPDF):
    def __init__(self, title: str):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.archive_title = title
        self.set_auto_page_break(auto=True, margin=15)
        self.alias_nb_pages()

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", size=8)
        self.set_text_color(100, 116, 139)
        self.cell(0, 5, _text(f"{self.archive_title} · Seite {self.page_no()}/{{nb}}"), align="C")
        self.set_text_color(0, 0, 0)

    def heading(self, text: str, size: int = 14):
        self.set_font("Helvetica", style="B", size=size)
        self.cell(0, 9, _text(text), new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", size=9)


def _standings_section(pdf: _ArchivePdf, tournament: Tournament, db: Session) -> None:
    pdf.heading("Abschlusstabelle (Schweizer System)")
    standings = calculate_standings(tournament.id, db)
    if not standings:
        pdf.cell(0, 6, "Keine Mannschaften.", new_x="LMARGIN", new_y="NEXT")
        return
    with pdf.table(
        col_widths=(10, 42, 58, 10, 18, 18, 16, 18),
        text_align=("RIGHT", "LEFT", "LEFT", "RIGHT", "CENTER", "CENTER", "RIGHT", "CENTER"),
        headings_style=HEADER,
        line_height=5.5,
    ) as table:
        table.row(["Pl.", "Mannschaft", "Spieler", "Sp.", "S-U-N", "Spiele", "Buchh.", "Sätze"])
        for s in standings:
            table.row([_text(v) for v in (
                s["rank"],
                s["team_name"],
                f"{s['player1']} / {s['player2']}",
                s["matches_played"],
                f"{s['won_matches']}-{s['drawn_matches']}-{s['lost_matches']}",
                f"{s['game_points']}:{s['game_points_lost']}",
                f"{s['buchholz']:g}",
                f"{s['sets_won']}:{s['sets_lost']}",
            )])


def _ko_section(pdf: _ArchivePdf, rounds: List[Round]) -> None:
    ko_rounds = [r for r in rounds if r.round_type == "ko"]
    if not ko_rounds:
        return
    pdf.ln(4)
    pdf.heading("KO-Phase")
    champion = _champion(rounds)
    if champion:
        pdf.set_font("Helvetica", style="B", size=11)
        pdf.cell(0, 7, _text(f"Turniersieger: {champion}"), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", size=9)
    with pdf.table(
        col_widths=(30, 70, 20, 70),
        text_align=("LEFT", "RIGHT", "CENTER", "LEFT"),
        headings_style=HEADER,
        line_height=5.5,
    ) as table:
        table.row(["Runde", "Heim", "Ergebnis", "Gast"])
        for r in ko_rounds:
            for m in sorted(r.team_matches, key=lambda m: m.ko_slot or 0):
                row = table.row()
                row.cell(_text(r.ko_stage or ""))
                row.cell(_text(_team_name(m, "A")), style=WINNER if m.winner_team_id == m.team_a_id else None)
                row.cell(f"{m.score_a}:{m.score_b}" if m.is_completed else "offen")
                row.cell(_text(_team_name(m, "B")),
                         style=WINNER if m.team_b_id and m.winner_team_id == m.team_b_id else None)


def _match_rows(table, match: TeamMatch) -> None:
    if match.is_bye:
        row = table.row()
        row.cell(_text(f"{_team_name(match, 'A')} hat ein Freilos ({match.score_a}:{match.score_b})"), colspan=4,
                 style=WINNER)
        return
    tables = "/".join(str(t) for t in (match.table_number, match.table_number_b) if t)
    score = f"{match.score_a}:{match.score_b}" if match.is_completed else f"{match.score_a}:{match.score_b} (offen)"
    row = table.row(style=MATCH)
    row.cell(_text(f"Tisch {tables}" if tables else ""))
    row.cell(_text(_team_name(match, "A")))
    row.cell(score)
    row.cell(_text(_team_name(match, "B")))
    for game in match.individual_games:
        row = table.row()
        row.cell(_text(_game_label(game)))
        row.cell(_text(game.player_a_name or ""))
        row.cell(f"{game.sets_won_a}:{game.sets_won_b}" if game.is_completed else "-")
        row.cell(_text(game.player_b_name or ""))


def _rounds_section(pdf: _ArchivePdf, rounds: List[Round]) -> None:
    pdf.add_page()
    for i, r in enumerate(rounds):
        # A round starts on a new page unless its heading and first match still fit
        if i and pdf.will_page_break(45):
            pdf.add_page()
        elif i:
            pdf.ln(6)
        pdf.heading(_round_title(r), size=12)
        if not r.team_matches:
            pdf.cell(0, 6, "Keine Begegnungen.", new_x="LMARGIN", new_y="NEXT")
            continue
        with pdf.table(
            col_widths=(22, 74, 20, 74),
            text_align=("LEFT", "RIGHT", "CENTER", "LEFT"),
            headings_style=HEADER,
            line_height=5,
        ) as table:
            table.row(["", "Heim", "Ergebnis", "Gast"])
            for m in sorted(r.team_matches, key=lambda m: (m.ko_slot or 0, m.table_number or 999, m.id)):
                _match_rows(table, m)


def build_archive_pdf(tournament: Tournament, db: Session, now: Optional[datetime] = None) -> bytes:
    """Renders the whole tournament as an A4 PDF for archiving."""
    now = now or datetime.now()
    rounds = db.query(Round).filter(Round.tournament_id == tournament.id).order_by(Round.round_number).all()

    pdf = _ArchivePdf(tournament.name)
    pdf.set_title(_text(f"{tournament.name} - Ergebnisarchiv"))
    pdf.add_page()
    pdf.set_font("Helvetica", style="B", size=18)
    pdf.cell(0, 10, _text(tournament.name), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", size=9)
    pdf.cell(0, 5, _text(
        f"Ergebnisarchiv, erstellt am {now:%d.%m.%Y um %H:%M} Uhr · {len(rounds)} Runden · "
        f"Best of {tournament.best_of_sets}"
    ), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    _standings_section(pdf, tournament, db)
    _ko_section(pdf, rounds)
    _rounds_section(pdf, rounds)
    return bytes(pdf.output())
