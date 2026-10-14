---
name: verify
description: Verify the current changes by running backend and frontend tests, linters and the frontend production build. Use after changing backend or frontend code, before committing, or when asked whether things still work.
---

Run the checks from the repo root and report each separately:

1. Backend tests:
   `PYTHONPATH=. backend/venv/bin/pytest backend/tests/ -q`
   (This drops and recreates the local `tt_turnier.db` — that's expected and fine.)
2. Frontend tests and build:
   `cd frontend && npm test && npm run build`
3. Lint: `backend/venv/bin/ruff check .` and `cd frontend && npm run lint`

If `backend/venv` or `frontend/node_modules` is missing, tell the user to run `./dev.sh` once (or install deps) rather than creating them silently.

Report: pass/fail per check, and for failures the failing test names or the first build error with file:line. Don't fix failures unless asked — summarize the likely cause instead.
