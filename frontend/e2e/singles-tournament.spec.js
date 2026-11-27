import { test, expect } from '@playwright/test';
import { createRng, resolveSeed } from './support/random.js';
import { TournamentDriver, closeRunningTournaments } from './support/tournament.js';

// Einzelturnier: created on the start page with its Gewinnsätze, players need only a
// name, a match is one game whose set count is the score, KO without doubles.

const SEED = resolveSeed();
const PLAYERS = ['Anna Adler', 'Ben Berg', 'Cem Cakir', 'Dora Diehl'];

test('Einzelturnier: anlegen, Spieler, Runde, Tabelle, KO', async ({ page, request }, testInfo) => {
  await closeRunningTournaments(request);
  const driver = new TournamentDriver(page, createRng(SEED), testInfo);
  await driver.open();
  await driver.unlockAdmin();
  const name = `Einzel #${SEED}`;

  await test.step('Anlegen als Einzelturnier mit 2 Gewinnsätzen', async () => {
    await driver.goto('Turniere');
    await page.getByLabel(/Neues Turnier/).fill(name);
    await page.getByLabel('Spielform').selectOption('singles');
    await page.getByLabel('Gewinnsätze').selectOption('3');
    await page.getByRole('button', { name: /Anlegen/ }).click();
    await expect(page.getByText('Turnierleitung / Administration')).toBeVisible();
    await expect(page.getByText(/Einzel · 2 Gewinnsätze/).first()).toBeVisible();
  });

  await test.step('Spieler nur mit Namen anlegen', async () => {
    await page.getByRole('button', { name: /^Spieler \(/ }).click();
    const input = page.getByPlaceholder('Vor- und Nachname');
    for (const [i, player] of PLAYERS.entries()) {
      await input.fill(player);
      await page.getByRole('button', { name: 'Spieler hinzufügen' }).click();
      await expect(page.getByRole('button', { name: `Spieler (${i + 1})` })).toBeVisible();
    }
    driver.expectNoProblems();
  });

  await test.step('Runde 1: ein Spiel pro Begegnung, Ergebnis = Satzstand', async () => {
    await driver.drawSwissRound(1);
    await driver.goto('Ergebniseingabe');
    const tiles = page.locator('[data-testid="match-tile"][data-active="true"]');
    await expect(tiles).toHaveCount(2);
    await expect(tiles.first()).toContainText('Spiel: ');
    for (let remaining = 2; remaining > 0; remaining -= 1) {
      await expect(tiles).toHaveCount(remaining);
      await tiles.first().click();
      await expect(page.getByRole('button', { name: /^Spiel/ })).toHaveCount(1);
      await expect(page.getByRole('button', { name: '3:1', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: '2:1', exact: true }).click();
      await expect(page.getByText('Beendet', { exact: true })).toBeVisible();
      await expect(page.getByText('2 : 1', { exact: true }).first()).toBeVisible();
      await page.getByRole('button', { name: '← Begegnungsauswahl' }).click();
    }
    await driver.completeRound(1);
    await driver.screenshot('einzel-runde-1');
  });

  await test.step('Tabelle zählt Siege, ohne Spielerspalte', async () => {
    await driver.goto('Tabelle');
    await expect(page.getByRole('columnheader', { name: 'Siege' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'S - N' })).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(4);
    await expect(page.locator('tbody tr').first()).toContainText('1 - 0');
    await driver.screenshot('einzel-tabelle');
  });

  await test.step('Spielzettel und Monitor', async () => {
    await driver.goto('Spielzettel');
    await expect(page.getByText('Unterschrift Spieler A').first()).toBeVisible();
    await expect(page.getByText(/Doppel/)).toHaveCount(0);
    await driver.goto('Hallen-Monitor');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
    await expect(page.getByTestId('monitor-game')).toHaveCount(0);
  });

  await test.step('KO ohne Doppel', async () => {
    await driver.startKo(4);
    await driver.goto('Ergebniseingabe');
    const tiles = page.locator('[data-testid="match-tile"][data-active="true"]');
    await tiles.first().click();
    await page.getByRole('button', { name: '1:2', exact: true }).click();
    await expect(page.getByText('Beendet', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Doppel/ })).toHaveCount(0);
    driver.expectNoProblems();
  });
});
