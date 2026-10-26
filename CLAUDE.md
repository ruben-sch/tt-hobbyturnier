# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Architecture decisions, requirements (laptop + own router on tournament day, one club) and what was deliberately left unchanged are in `docs/architecture.md` — read it before proposing stack, hosting or security changes.

## Running

- `./dev.sh` is for development: Vite dev with HMR on :5173 (proxies `/api` and `/ws` to :8000) and `uvicorn --reload` on :8000, which serves the prebuilt `frontend/dist`. Port 8000 only shows frontend changes after `npm run build` in `frontend/`.
- `./run.sh` is tournament mode: builds the frontend once and runs a single uvicorn on :8000 without `--reload` and without Vite. Don't add `--reload` back — a file save on tournament day would drop every WebSocket connection.
- Both scripts source `scripts/common.sh`, which installs deps only if `backend/venv` / `frontend/node_modules` are missing — after changing `backend/requirements.txt`, run `backend/venv/bin/pip install -r backend/requirements.txt` yourself.
- Server deployment: release-please (`.github/workflows/release.yml`) → image on GHCR → self-hosted runner runs `deploy/deploy.sh` (Traefik labels, network `rs_proxy`). Details in `deploy/README.md`. `TT_ADMIN_PIN` sets the admin PIN of new tournaments.
- Backend imports are absolute (`backend.app...`): always run from the repo root with `PYTHONPATH=.`.
- Tests: `PYTHONPATH=. backend/venv/bin/pytest backend/tests/ -v`. The integration tests drop/recreate the real app DB (`tt_turnier.db` at repo root unless `DATABASE_URL` is set) — that's accepted, local data is disposable.
- Lint: `backend/venv/bin/ruff check .` (config in `ruff.toml`) and `npm run lint` in `frontend/` (ESLint 9 flat config). No formatter is configured.
- Frontend tests: `npm test` in `frontend/` (Vitest + jsdom + Testing Library; component tests mock `services/api.js` with `vi.mock`).
- E2E: `npm run test:e2e` in `frontend/` (Playwright, `e2e/`). Builds the frontend and starts its own uvicorn on :8001 with `e2e_turnier.db`, then plays two full 17-team tournaments through the UI (~3 min) and a short QR-code scenario (monitor/sheet QR → result entry in a phone viewport). `E2E_SEED` replays a run (it also seeds the backend's `random` via `TT_RANDOM_SEED`). Selectors use roles/text plus a few `data-testid`s (`match-tile`, `active-round`, `scorer-qr`, `sheet-qr` — the QR ones carry the encoded link in `data-url`) — keep those when restyling. Output in `frontend/e2e-results/`.
- Coverage: add `--cov=backend/app --cov-report=term-missing` to the pytest command, `npm run test:coverage` in `frontend/`. CI fails below 95 % (backend) and the thresholds in `frontend/vite.config.js` — raise them when coverage goes up.
- CI (`.github/workflows/ci.yml`) runs backend lint+tests and frontend lint+tests+build on every PR; `main` requires both jobs to pass — work on a branch and open a PR.

## Constraints

- The venv is Python 3.9: no `X | None`, no `match`, no built-in generics in runtime-evaluated annotations — use `typing.Optional`/`List`.
- No migrations: the schema comes from `Base.metadata.create_all()` at startup. After changing `backend/app/models.py`, delete `tt_turnier.db` so it is recreated.
- Live updates (`frontend/src/hooks/useLiveEvents.js`): App reloads the tournament on structural events (`TOURNAMENT_EVENTS`) and on every WebSocket (re)connect, and every view refetches because its loader is `useCallback(..., [tournament])` — keep it that way, not `[tournament.id]`. Frequent events (`MATCH_EVENTS`, `TEAM_EVENTS`) reach views through `useLiveEvent(types, handler)`. No polling, no remounting views via `key`.
- Admin endpoints (anything the Turnierleitung does: settings, teams, rounds, KO) take `dependencies=[Depends(require_admin)]` from `backend/app/auth.py`, which checks the `X-Admin-Pin` header; on the frontend they go through `adminFetch` in `api.js`. Result entry (lineup, game results) stays open on purpose. Never return `admin_pin` in a response.
- Routers must `await ws_manager.broadcast({"type": ...})` after mutations — frontend views (HallenMonitor, TableScorer, …) only refetch on these WebSocket events. A new event type must be added to one of the lists in `useLiveEvents.js`, or no view reacts to it.
- Match rules: Swiss rounds are 4 singles and may end 2:2 (draw). KO matches end at 3 wins; at 2:2 a deciding doubles (5th game) is added automatically. Only the final set count of each game is recorded (`POST .../games/{id}/result`, 0:0 resets) — no set or ball scores; `check_and_update_match_status` recomputes the match from its games so corrections work both ways.

## Conventions

- User-facing text (UI, API error messages) is German; identifiers and comments are English. Existing German domain names (`HallenMonitor`, KO stages "Viertelfinale"/"Halbfinale"/"Finale") stay as they are.
- Frontend is plain JSX + Tailwind, no router: navigation is the `currentTab` state in `App.jsx`. All HTTP calls go through `frontend/src/services/api.js`.
- Commits use conventional-commit prefixes (`feat:`, `fix:`, `chore:` …).

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `ruben-sch/tt-hobbyturnier` (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root, plus `docs/architecture.md` for existing decisions. See `docs/agents/domain.md`.
