# Architecture review (2026-10-13)

Outcome of an architecture and tech stack review. It records the requirements the stack is judged against, the verdict, and what was deliberately left as is.

## Requirements

- **Scope:** one club, a few tournaments a year, run by one Turnierleitung. Since 2026-11 several tournaments (classes, e.g. Hobby and Jugend) can run at once in the same hall. Not multi-tenant, and not shared with other clubs.
- **Hosting on the day:** a laptop with its own travel router, forming a closed network. Players' phones, the beamer and the admin tablet join that network. It must not depend on the hall's Wi-Fi or on mobile data.
- **Online results:** since 2026-10-26 the app can also run on the Hetzner server behind the shared Traefik under a public subdomain (`deploy/`, same pattern as teamtafel). The laptop + own router setup stays the fallback for halls without reliable mobile internet.
- **Failure tolerance:** the printed match sheets (`PrintableSheets`) are the fallback. If the server or laptop dies, restart and re-enter results from paper. Automatic backups and failover are not needed. SQLite commits every result, so a process crash loses nothing.
- **Maintenance:** mostly done with Claude Code. The organiser knows Go, not Python or React.
- **Schema changes:** no migrations. Deleting `tt_turnier.db` between events is acceptable.

## Verdict: keep the stack

FastAPI with SQLAlchemy and SQLite, a React single-page app (Vite, Tailwind), WebSocket push, and PIN-based access with no user accounts. This fits the requirements:

- It is one process with one database file and no external services, which suits a single laptop.
- The in-memory WebSocket hub only works with one server process, and that is exactly how it runs.
- CI (ruff, pytest, ESLint, Vitest, build) is required before merging to `main`, so changes made with Claude are caught when they regress something.

### Alternatives considered

| Alternative | Gain | Why not now |
|---|---|---|
| Rewrite the backend in Go, with the frontend embedded in the binary | One binary and no Python, venv or Node on the event laptop. Code the organiser can read. | Weeks of work, and the Swiss pairing and KO logic plus their tests would all need porting. None of the problems found are caused by the language. Revisit only if maintaining the Python code actually becomes a problem. |
| Server-rendered Python with HTMX instead of the React app | One language and one server, with no Node or build step. | Moderate effort, and live updates would need reworking. It doesn't fix any concrete problem. |
| Full cloud hosting | Results reachable from anywhere. | Needs TLS and real authentication, and depends on mobile internet in the hall. That conflicts with the own-router setup. |

## Deliberately unchanged

- No user accounts: the public deployment relies on a strong `TT_ADMIN_PIN`.

## Changed since

- **2026-10-26: result entry needs the admin PIN.** It used to be open to anyone; with the public deployment and the MCP server that was too easy to abuse. Match and table PINs and the per-match QR codes on the sheets were removed. Players follow the live scores via the QR code on the Hallen-Monitor; the Turnierleitung enters results (web UI or MCP).
- **2026-10-26: MCP server** at `/mcp` inside the same process (no extra service). Live scores means match score and current game per table; set or ball scores are not recorded.
- **2026-10-26: OAuth for the MCP server** so claude.ai can connect: the app is its own authorization server and the login is the admin PIN. All of `/mcp` needs auth now (OAuth discovery only starts on a 401), the read tools included. No external identity provider.
- **2026-10-26: Python 3.15** (was 3.9), needed by the MCP SDK.
- **2026-11-27: several tournaments in parallel.** Use case: several classes on the same day in the same hall, plus a history of past tournaments. Decided in a design grilling:
  - Status "läuft"/"abgeschlossen" (`Tournament.is_active`); several may run. Abgeschlossene stay viewable and editable and can be reopened or deleted. Creating a tournament no longer replaces the previous one, and reset no longer deletes older tournaments.
  - One global admin PIN (`TT_ADMIN_PIN`) instead of one per tournament; MCP OAuth tokens are bound to it.
  - No tables at all: no table count, no tables per match, no table assignment. The Turnierleitung writes the table number on the match sheet by hand; a match plays its games in order.
  - The navigation picks the tournament (`?turnier=<id>`); result entry mixes all running tournaments; the Hallen-Monitor rotates through them; its QR code opens the start page "Turniere".
  - No schema change: existing databases keep working, old columns stay unused.
- **2026-11-27: Einzelturniere.** Per tournament, chosen when it is created and fixed afterwards: 2er-Teams (4 singles per match, KO doubles at 2:2) or Einzelturnier. In an Einzelturnier a "team" is one player (`Team.name`, `player2_name` empty), a match is one game, its score is that game's set count (no draws, no doubles), and the standings count wins (`match_rules.match_points`). The Gewinnsätze (best of 3/5) stay selectable for both. New column `tournaments.is_singles`; `database.add_missing_columns()` adds columns like it to older databases at startup, so their history stays.
- No automatic database backups. Paper is the fallback.
- No migration tooling.
