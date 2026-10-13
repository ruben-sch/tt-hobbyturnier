# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running

- `./run.sh` starts both servers: Vite dev with HMR on :5173 (proxies `/api` and `/ws` to :8000) and uvicorn on :8000, which serves the prebuilt `frontend/dist`. Port 8000 only shows frontend changes after `npm run build` in `frontend/`.
- run.sh installs deps only if `backend/venv` / `frontend/node_modules` are missing — after changing `backend/requirements.txt`, run `backend/venv/bin/pip install -r backend/requirements.txt` yourself.
- Backend imports are absolute (`backend.app...`): always run from the repo root with `PYTHONPATH=.`.
- Tests: `PYTHONPATH=. backend/venv/bin/pytest backend/tests/ -v`. The integration tests drop/recreate the real app DB (`tt_turnier.db` at repo root unless `DATABASE_URL` is set) — that's accepted, local data is disposable.
- Lint: `backend/venv/bin/ruff check .` (config in `ruff.toml`) and `npm run lint` in `frontend/` (ESLint 9 flat config). No formatter is configured.
- Frontend tests: `npm test` in `frontend/` (Vitest + jsdom + Testing Library; component tests mock `services/api.js` with `vi.mock`).
- CI (`.github/workflows/ci.yml`) runs backend lint+tests and frontend lint+tests+build on every PR; `main` requires both jobs to pass — work on a branch and open a PR.

## Constraints

- The venv is Python 3.9: no `X | None`, no `match`, no built-in generics in runtime-evaluated annotations — use `typing.Optional`/`List`.
- No migrations: the schema comes from `Base.metadata.create_all()` at startup. After changing `backend/app/models.py`, delete `tt_turnier.db` so it is recreated.
- Components refetch when the `tournament` prop object changes (App reloads it on WebSocket events): keep loaders as `useCallback(..., [tournament])`, not `[tournament.id]`.
- Routers must `await ws_manager.broadcast({"type": ...})` after mutations — frontend views (HallenMonitor, TableScorer, …) only refetch on these WebSocket events.
- Match rules: Swiss rounds are 4 singles and may end 2:2 (draw). KO matches end at 3 wins; at 2:2 a deciding doubles (5th game) is added automatically.

## Conventions

- User-facing text (UI, API error messages) is German; identifiers and comments are English. Existing German domain names (`HallenMonitor`, KO stages "Viertelfinale"/"Halbfinale"/"Finale") stay as they are.
- Frontend is plain JSX + Tailwind, no router: navigation is the `currentTab` state in `App.jsx`. All HTTP calls go through `frontend/src/services/api.js`.
- Commits use conventional-commit prefixes (`feat:`, `fix:`, `chore:` …).
