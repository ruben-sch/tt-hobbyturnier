import re
import zlib

from backend.app.database import SessionLocal
from backend.app.models import Tournament


def pdf_text(data: bytes) -> str:
    """The text drawn in an fpdf2 PDF: its content streams, inflated."""
    streams = re.findall(rb"stream\r?\n(.*?)\r?\nendstream", data, re.S)
    out = []
    for s in streams:
        try:
            out.append(zlib.decompress(s).decode("latin-1"))
        except zlib.error:
            pass
    return "\n".join(out).replace("\\(", "(").replace("\\)", ")")


def play_tournament(client, t_id, add_teams, play):
    """One Swiss round with 5 teams (one bye), then semis and final."""
    client.put(f"/api/tournaments/{t_id}", json={"name": "Herbstturnier"})
    ids = add_teams(t_id, 4)
    # Not Latin-1: must not break the PDF's core font
    client.post(f"/api/tournaments/{t_id}/teams",
                json={"name": "Jürgen ☃ Söhne", "player1_name": "Jörg", "player2_name": "Ümit"})
    swiss = client.post(f"/api/tournaments/{t_id}/rounds/next-swiss").json()
    for m in swiss["team_matches"]:
        if m["team_b_id"]:
            play(m["id"], "AABA")
    client.post(f"/api/rounds/{swiss['id']}/complete")
    semis = client.post(f"/api/tournaments/{t_id}/rounds/start-ko", params={"team_count": 4}).json()
    for m in semis["team_matches"]:
        play(m["id"], "AAA")
    final = client.post(f"/api/tournaments/{t_id}/rounds/advance-ko").json()
    play(final["team_matches"][0]["id"], "ABABA")
    return ids


def test_pdf_export_contains_standings_rounds_and_ko(client, t_id, add_teams, play):
    play_tournament(client, t_id, add_teams, play)

    res = client.get(f"/api/tournaments/{t_id}/export/pdf", headers={"X-Admin-Pin": ""})
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert "turnier_archiv_" in res.headers["content-disposition"]
    assert res.content.startswith(b"%PDF")

    text = pdf_text(res.content)
    for expected in ("Herbstturnier", "Abschlusstabelle", "KO-Phase", "Turniersieger",
                     "Runde 1 (Schweizer System)", "Runde 2: Halbfinale (KO)", "Runde 3: Finale (KO)",
                     "Freilos", "Einzel 1", "Doppel", "3:1"):
        assert expected in text, expected


def test_pdf_export_of_an_empty_tournament(client, t_id):
    res = client.get(f"/api/tournaments/{t_id}/export/pdf")
    assert res.status_code == 200
    assert "Keine Mannschaften" in pdf_text(res.content)
    assert client.get("/api/tournaments/9999/export/pdf").status_code == 404


def test_pdf_export_with_an_open_round(client, t_id, add_teams):
    add_teams(t_id, 2)
    client.post(f"/api/tournaments/{t_id}/rounds/next-swiss")
    text = pdf_text(client.get(f"/api/tournaments/{t_id}/export/pdf").content)
    assert "(offen)" in text


def test_reset_deletes_everything_but_settings(client, t_id, add_teams, play):
    play_tournament(client, t_id, add_teams, play)
    old = client.post("/api/tournaments", json={"name": "Alt"}).json()  # becomes active
    client.post(f"/api/tournaments/{old['id']}/reset")  # resetting the new one removes t_id
    active_id = old["id"]

    with SessionLocal() as db:
        assert db.get(Tournament, t_id) is None

    add_teams(active_id, 2)
    client.post(f"/api/tournaments/{active_id}/rounds/next-swiss")
    res = client.post(f"/api/tournaments/{active_id}/reset")
    assert res.status_code == 200

    t = client.get("/api/tournaments/active").json()
    assert t["id"] == active_id
    assert t["name"] == "Alt"
    assert t["current_round_number"] == 0
    assert client.get(f"/api/tournaments/{active_id}/teams").json() == []
    assert client.get(f"/api/tournaments/{active_id}/rounds").json() == []
    assert client.get(f"/api/tournaments/{active_id}/standings").json() == []
    assert len(client.get(f"/api/tables/status/{active_id}").json()) == t["table_count"]

    # A fresh round starts again at 1
    add_teams(active_id, 2)
    assert client.post(f"/api/tournaments/{active_id}/rounds/next-swiss").json()["round_number"] == 1


def test_reset_needs_the_admin_pin(client, t_id):
    assert client.post(f"/api/tournaments/{t_id}/reset", headers={"X-Admin-Pin": ""}).status_code == 401
    assert client.post(f"/api/tournaments/{t_id}/reset", headers={"X-Admin-Pin": "falsch"}).status_code == 403
    assert client.post("/api/tournaments/9999/reset").status_code == 404
