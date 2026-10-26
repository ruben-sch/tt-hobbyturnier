import { expect } from '@playwright/test';
import { randomGameResult } from './random.js';

export const ADMIN_PIN = 'admin123';

// Replaces the active tournament with a fresh one, so every scenario starts empty.
// There is no UI for this; the organiser starts each event with a new database.
export async function createTournament(request, settings) {
  const res = await request.post('/api/tournaments', {
    headers: { 'X-Admin-Pin': ADMIN_PIN },
    data: { admin_pin: ADMIN_PIN, best_of_sets: 5, table_count: 8, tables_per_match: 1, ...settings },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return res.json();
}

// Expected standings, kept alongside the clicks and compared with the
// "Tabelle" view after every round. Mirrors calculate_standings().
export class Ledger {
  constructor(teams) {
    this.rows = new Map(teams.map((t) => [t.name, {
      name: t.name, played: 0, won: 0, drawn: 0, lost: 0,
      points: 0, pointsLost: 0, setsWon: 0, setsLost: 0, opponents: [], byes: 0,
    }]));
  }

  row(name) {
    const row = this.rows.get(name);
    if (!row) throw new Error(`Unbekanntes Team in der UI: ${name}`);
    return row;
  }

  addBye(name) {
    const r = this.row(name);
    r.played += 1; r.won += 1; r.points += 4; r.setsWon += 12; r.byes += 1;
  }

  // games: [[setsA, setsB], ...] as entered
  addMatch(teamA, teamB, games) {
    const a = this.row(teamA);
    const b = this.row(teamB);
    const winsA = games.filter(([x, y]) => x > y).length;
    const winsB = games.length - winsA;
    for (const [side, other, wins, lossCount] of [[a, b, winsA, winsB], [b, a, winsB, winsA]]) {
      side.played += 1;
      side.points += wins;
      side.pointsLost += lossCount;
      side.opponents.push(other.name);
      if (wins > lossCount) side.won += 1;
      else if (wins < lossCount) side.lost += 1;
      else side.drawn += 1;
    }
    for (const [x, y] of games) {
      a.setsWon += x; a.setsLost += y;
      b.setsWon += y; b.setsLost += x;
    }
  }

  hasPlayed(teamA, teamB) {
    return this.row(teamA).opponents.includes(teamB);
  }

  expected(name) {
    const r = this.row(name);
    return {
      played: r.played, won: r.won, drawn: r.drawn, lost: r.lost,
      points: r.points, pointsLost: r.pointsLost,
      buchholz: r.opponents.reduce((sum, o) => sum + this.row(o).points, 0),
      setsWon: r.setsWon, setsLost: r.setsLost, setDiff: r.setsWon - r.setsLost,
    };
  }
}

export class TournamentDriver {
  constructor(page, rng, testInfo) {
    this.page = page;
    this.rng = rng;
    this.testInfo = testInfo;
    this.problems = [];

    // Confirms ("Runde wirklich abschließen?") are part of the flow. Any alert
    // in this flow is an error message, so it is recorded and fails the step.
    page.on('dialog', async (dialog) => {
      if (dialog.type() !== 'confirm') this.problems.push(`${dialog.type()}: ${dialog.message()}`);
      await dialog.accept();
    });
    page.on('pageerror', (err) => this.problems.push(`pageerror: ${err.message}`));
  }

  expectNoProblems() {
    expect(this.problems, 'Fehlermeldungen in der UI').toEqual([]);
  }

  async goto(tab) {
    await this.page.getByRole('navigation').getByRole('button', { name: tab, exact: true }).click();
  }

  async open() {
    await this.page.goto('/');
    await expect(this.page.getByText('Live', { exact: true })).toBeVisible();
  }

  async unlockAdmin() {
    await this.goto('Turnierleitung');
    await this.page.locator('#admin-pin').fill(ADMIN_PIN);
    await this.page.getByRole('button', { name: 'Entsperren' }).click();
    await expect(this.page.getByText('Turnierleitung / Administration')).toBeVisible();
  }

  async addTeams(teams) {
    await this.goto('Turnierleitung');
    await this.page.getByRole('button', { name: /^Teams \(/ }).click();
    const form = this.page.locator('form', { hasText: 'Mannschaftsname' });
    const inputs = form.locator('input');
    for (const [i, team] of teams.entries()) {
      await inputs.nth(0).fill(team.name);
      await inputs.nth(1).fill(team.player1);
      await inputs.nth(2).fill(team.player2);
      await form.getByRole('button', { name: 'Team hinzufügen' }).click();
      await expect(this.page.getByRole('button', { name: `Teams (${i + 1})` })).toBeVisible();
    }
    this.expectNoProblems();
  }

  async drawSwissRound(roundNumber) {
    await this.goto('Turnierleitung');
    await this.page.getByRole('button', { name: 'Runden & Spiele' }).click();
    await this.page.getByRole('button', { name: 'Nächste Runde auslosen (Schweizer System)' }).click();
    await expect(this.page.getByText(`Runde ${roundNumber} (Schweizer System) läuft`)).toBeVisible();
    this.expectNoProblems();
  }

  async startKo(teamCount) {
    await this.goto('Turnierleitung');
    await this.page.getByRole('button', { name: 'Runden & Spiele' }).click();
    await this.page.getByRole('button', { name: `Top ${teamCount} KO starten` }).click();
    await expect(this.page.getByText(/\(Viertelfinale\) läuft|\(Halbfinale\) läuft/)).toBeVisible();
    this.expectNoProblems();
  }

  async advanceKo(nextStage) {
    await this.goto('KO-Baum');
    await this.page.getByRole('button', { name: `Folgerunde starten (${nextStage})` }).click();
    await this.goto('Turnierleitung');
    await expect(this.page.getByText(`(${nextStage}) läuft`)).toBeVisible();
    this.expectNoProblems();
  }

  // Plays every open match of the active round in "Ergebniseingabe".
  // Returns [{ teamA, teamB, games }] in the order they were played.
  async playRound(matchCount, { ko = false } = {}) {
    const page = this.page;
    await this.goto('Ergebniseingabe');
    const openTiles = page.locator('[data-testid="match-tile"][data-active="true"]');
    const played = [];

    for (let remaining = matchCount; remaining > 0; remaining -= 1) {
      await expect(openTiles).toHaveCount(remaining);
      await openTiles.first().click();
      played.push(await this.playMatch(ko));
      await page.getByRole('button', { name: '← Begegnungsauswahl' }).click();
    }
    await expect(openTiles).toHaveCount(0);
    this.expectNoProblems();
    return played;
  }

  async playMatch(ko) {
    const page = this.page;
    await expect(page.getByRole('heading', { name: 'Aufstellung festlegen' })).toBeVisible();
    const headings = page.getByRole('heading', { level: 3 });
    const teamA = (await headings.nth(0).textContent()).trim();
    const teamB = (await headings.nth(1).textContent()).trim();

    // Random lineup: who plays at position 1 is a coin toss per team.
    const selects = page.locator('select');
    for (const i of [0, 1]) {
      const options = await selects.nth(i).locator('option').allTextContents();
      await selects.nth(i).selectOption({ label: this.rng.pick(options) });
    }
    await page.getByRole('button', { name: /Aufstellung bestätigen/ }).click();
    await expect(page.getByText('Gesamtstand')).toBeVisible();

    const games = [];
    let winsA = 0;
    let winsB = 0;
    for (let order = 1; order <= 5; order += 1) {
      const swissDone = !ko && order > 4;
      const koDone = ko && (winsA === 3 || winsB === 3);
      if (swissDone || koDone) break;
      // The deciding doubles only exists in KO at 2:2 after the singles.
      if (order === 5 && !(ko && winsA === 2 && winsB === 2)) break;

      const label = order === 5 ? '5. Doppel' : `${order}. Einzel`;
      const tab = page.getByRole('button', { name: new RegExp(`^${label.replace('.', '\\.')}`) });
      await tab.click();
      const [a, b] = randomGameResult(this.rng);
      await page.getByRole('button', { name: `${a}:${b}`, exact: true }).click();
      await expect(tab).toContainText(`${a} : ${b}`);
      await expect(tab).toContainText('Abgeschlossen');
      games.push([a, b]);
      if (a > b) winsA += 1; else winsB += 1;
    }

    await expect(page.getByText('Beendet', { exact: true })).toBeVisible();
    await expect(page.getByText(`${winsA} : ${winsB}`, { exact: true }).first()).toBeVisible();
    return { teamA, teamB, games, winner: winsA > winsB ? teamA : teamB };
  }

  async completeRound(roundNumber) {
    await this.goto('Turnierleitung');
    await this.page.getByRole('button', { name: 'Runden & Spiele' }).click();
    await this.page.getByRole('button', { name: `Runde ${roundNumber} abschließen` }).click();
    await expect(this.page.getByText('Keine aktive Runde')).toBeVisible();
    this.expectNoProblems();
  }

  // Reads the "Tabelle" view as plain values.
  async readStandings() {
    await this.goto('Tabelle');
    const rows = this.page.locator('tbody tr');
    await expect(rows.first()).not.toContainText('Lade Tabelle');
    const pair = (text) => text.split(':').map((x) => Number(x.trim()));
    return (await rows.evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((td) => td.textContent.trim()))))
      .map((cells) => {
        const [won, drawn, lost] = cells[4].split('-').map((x) => Number(x.trim()));
        const [points, pointsLost] = pair(cells[5]);
        const setsMatch = cells[7].match(/^(\d+)\s*:\s*(\d+)\s*\(([+-]?\d+)\)$/);
        return {
          rank: Number(cells[0]), name: cells[1], players: cells[2], played: Number(cells[3]),
          won, drawn, lost, points, pointsLost, buchholz: Number(cells[6]),
          setsWon: Number(setsMatch[1]), setsLost: Number(setsMatch[2]), setDiff: Number(setsMatch[3]),
        };
      });
  }

  async screenshot(name, locator = null) {
    const options = {
      path: this.testInfo.outputPath('screenshots', `${name}.png`),
      // The sticky navbar would cover the top of element screenshots.
      style: 'header { position: static !important; }',
    };
    const body = locator
      ? await locator.screenshot(options)
      : await this.page.screenshot({ ...options, fullPage: true });
    await this.testInfo.attach(name, { body, contentType: 'image/png' });
  }

  async screenshotStandings(prefix) {
    await this.goto('Tabelle');
    await expect(this.page.locator('tbody tr').first()).not.toContainText('Lade Tabelle');
    await this.screenshot(`${prefix}-tabelle`);
  }

  // The admin's view of the active round: every pairing with players and score.
  async screenshotRoundResults(prefix) {
    await this.goto('Turnierleitung');
    await this.page.getByRole('button', { name: 'Runden & Spiele' }).click();
    const panel = this.page.getByTestId('active-round');
    await expect(panel).not.toContainText('Aufstellung offen');
    await this.screenshot(`${prefix}-ergebnisse`, panel);
  }

  async screenshotBracket(prefix, stage) {
    await this.goto('KO-Baum');
    await expect(this.page.getByText(stage, { exact: true })).toBeVisible();
    await this.screenshot(`${prefix}-ko-baum`);
  }
}
