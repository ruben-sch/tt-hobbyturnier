# Architecture review (2026-10-13)

Outcome of an architecture and tech stack review. It records the requirements the stack is judged against, the verdict, the planned changes, and what was deliberately left as is.

## Requirements

- **Scope:** one club, a few tournaments a year, one active tournament at a time, run by one organiser. Not multi-tenant, and not shared with other clubs.
- **Hosting on the day:** a laptop with its own travel router, forming a closed network. Players' phones, the beamer and the admin tablet join that network. It must not depend on the hall's Wi-Fi or on mobile data.
- **Online results:** not needed for now. `docker-compose.yml` stays in case that changes.
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

## Planned changes

Each change gets its own PR, in this order.

### 1. Separate dev mode from tournament mode

**Problem:** `run.sh` always starts the development setup: `uvicorn --reload` plus the Vite dev server on :5173. On tournament day, saving any file restarts the backend and drops every WebSocket connection.

**Change:**
- A tournament start script builds the frontend once and runs a single uvicorn on :8000, with no `--reload` and no Vite.
- The current behaviour (HMR on :5173 plus `--reload`) moves to a separate dev script.

### 2. Admin PIN gate

**Problem:** the PINs don't protect anything today.
- The admin PIN is only checked at the scorer's PIN prompt (`routers/tables.py`).
- The admin tab (Turnierleitung) and all admin endpoints are open to anyone on the network: generating rounds, deleting teams, changing settings.
- The tournament API returns `admin_pin` to every client.

On the own-router setup, every player's phone is on that network.

**Change:**
- Admin endpoints require the admin PIN, sent as a request header and checked in a single FastAPI dependency.
- The admin tab asks for the PIN.
- The API no longer sends `admin_pin` to clients.

### 3. One mechanism for live screen updates

**Problem:** views refresh in three different ways at once:
- `App.jsx` remounts components on every WebSocket event by bumping `refreshKey`.
- `HallenMonitor` also polls every 3 seconds.
- `TableScorer` is never remounted, so it misses updates from other devices.

When the WebSocket reconnects (after 3 seconds), events sent in the meantime are lost.

**Change:**
- A WebSocket event triggers a targeted refetch in the views it affects, including `TableScorer`.
- Every view refetches after a reconnect, to catch up on events it missed.
- Remove the `refreshKey` remounts and the polling.

## Deliberately unchanged

- **Result entry stays open:** anyone can open any match from the scorer's list and enter results. Match PINs remain, but they aren't enforced. The admin corrects mistakes.
- No cloud hosting or online results view.
- No automatic database backups. Paper is the fallback.
- No migration tooling.
