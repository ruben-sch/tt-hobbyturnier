import { test, expect } from '@playwright/test';
import { createRng, generateTeams, resolveSeed } from './support/random.js';
import { TournamentDriver, closeRunningTournaments, createTournament, startFirstRound } from './support/tournament.js';

// Two classes on the same day in the same hall: both tournaments run at once.
// The result entry lists the matches of both, labelled; the Hallen-Monitor shows
// them in turn; the start page (QR code) lets players pick their class; an
// abgeschlossenes tournament stays as history.

const SEED = resolveSeed();

test('Zwei Turniere parallel: gemischte Ergebniseingabe, Monitor im Wechsel, Verlauf', async ({ page, request }, testInfo) => {
  await closeRunningTournaments(request);
  const hobby = await createTournament(request, { name: `Hobby #${SEED}` }, { parallel: true });
  const jugend = await createTournament(request, { name: `Jugend #${SEED}`, best_of_sets: 3 }, { parallel: true });
  await startFirstRound(request, hobby.id, generateTeams(createRng(SEED + 1), 4));
  await startFirstRound(request, jugend.id, generateTeams(createRng(SEED + 2), 4));

  const driver = new TournamentDriver(page, createRng(SEED), testInfo);
  await driver.open();

  await test.step('Startseite listet beide laufenden Turniere', async () => {
    await driver.goto('Turniere');
    const cards = page.getByTestId('tournament-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.filter({ hasText: hobby.name })).toBeVisible();
    await expect(cards.filter({ hasText: jugend.name })).toBeVisible();
    await driver.screenshot('parallel-startseite');
  });

  await test.step('Ergebniseingabe zeigt die Begegnungen beider Turniere', async () => {
    await driver.unlockAdmin();
    await driver.goto('Ergebniseingabe');
    const tiles = page.locator('[data-testid="match-tile"][data-active="true"]');
    await expect(tiles).toHaveCount(4);
    await expect(page.locator(`[data-testid="match-tile"][data-tournament="${hobby.name}"]`)).toHaveCount(2);
    await expect(page.locator(`[data-testid="match-tile"][data-tournament="${jugend.name}"]`)).toHaveCount(2);
    await driver.screenshot('parallel-ergebniseingabe');

    // Jugend plays best of 3: its result buttons offer 2:x
    await page.locator(`[data-testid="match-tile"][data-tournament="${jugend.name}"]`).first().click();
    await expect(page.getByRole('button', { name: '2:1', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '3:1', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '2:0', exact: true }).click();
    await expect(page.getByText('1 : 0', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: '← Begegnungsauswahl' }).click();
  });

  await test.step('Hallen-Monitor wechselt zwischen den Turnieren', async () => {
    await driver.goto('Hallen-Monitor');
    const rotation = page.getByTestId('monitor-rotation');
    await expect(rotation).toContainText('/2');
    const heading = page.getByRole('heading', { level: 1 });
    const first = await heading.textContent();
    await expect(heading).not.toHaveText(first, { timeout: 20_000 });
    await driver.screenshot('parallel-monitor');

    // A single tournament picked in the navigation stays put
    await page.getByRole('combobox', { name: 'Turnier wählen' }).selectOption(String(hobby.id));
    await expect(rotation).toHaveCount(0);
    await expect(heading).toHaveText(hobby.name);
  });

  await test.step('Abgeschlossenes Turnier bleibt im Verlauf und fällt aus der Ergebniseingabe', async () => {
    await driver.goto('Turnierleitung');
    await page.getByRole('button', { name: 'Einstellungen' }).click();
    await page.getByRole('button', { name: /Turnier abschließen/ }).click();
    await expect(page.getByRole('button', { name: /Wieder öffnen/ })).toBeVisible();

    await driver.goto('Ergebniseingabe');
    await expect(page.locator('[data-testid="match-tile"]')).toHaveCount(2);
    await expect(page.locator(`[data-testid="match-tile"][data-tournament="${hobby.name}"]`)).toHaveCount(0);

    await driver.goto('Turniere');
    await expect(page.getByTestId('tournament-card')).toHaveCount(1);
    await expect(page.getByText('Abgeschlossene Turniere')).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: hobby.name })).toBeVisible();
    driver.expectNoProblems();
  });
});
