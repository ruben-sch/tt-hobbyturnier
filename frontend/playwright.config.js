import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Resolved once here; workers inherit it, and the backend seeds its random
// draw with it, so E2E_SEED=<seed> replays a run exactly.
process.env.E2E_SEED ||= String(Math.floor(Math.random() * 2 ** 31));

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.E2E_PORT || 8001);

// Local runs use the project venv, CI installs the requirements globally.
const venvPython = path.join(repoRoot, 'backend/venv/bin/python');
const python = process.env.E2E_PYTHON || (existsSync(venvPython) ? venvPython : 'python3');

// Own database file, recreated for every run, so the tournament starts empty
// and the dev database (tt_turnier.db) stays untouched.
const dbFile = path.join(repoRoot, 'e2e_turnier.db');

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e-results/artifacts',
  // One full tournament takes a few minutes of clicking.
  timeout: 20 * 60 * 1000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [
    ['list'],
    ['html', { outputFolder: './e2e-results/report', open: 'never' }],
  ],
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    // Same setup as run.sh: built frontend served by a single uvicorn.
    command: `rm -f "${dbFile}" && npm run build && cd "${repoRoot}" && "${python}" -m uvicorn backend.app.main:app --port ${port}`,
    url: `http://localhost:${port}/api/tournaments/active`,
    env: { PYTHONPATH: repoRoot, DATABASE_URL: `sqlite:///${dbFile}`, TT_RANDOM_SEED: process.env.E2E_SEED },
    reuseExistingServer: false,
    timeout: 180_000,
    stderr: 'pipe',
  },
});
