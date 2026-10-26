import { test, expect } from '@playwright/test';
import { createRng, generateTeams, resolveSeed } from './support/random.js';
import { ADMIN_PIN, TournamentDriver, createTournament } from './support/tournament.js';

// Players scan the QR code on the Hallen-Monitor and follow the live scores on
// their phone. The code must point at the server's LAN address (not localhost).
// Results are entered by the Turnierleitung only, with the admin PIN.

const SEED = resolveSeed();

async function setupRound(request) {
  const tournament = await createTournament(request, { name: `E2E QR #${SEED}` });
  const headers = { 'X-Admin-Pin': ADMIN_PIN };
  for (const team of generateTeams(createRng(SEED + 4711), 4)) {
    const res = await request.post(`/api/tournaments/${tournament.id}/teams`, {
      headers,
      data: { name: team.name, player1_name: team.player1, player2_name: team.player2 },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
  }
  const res = await request.post(`/api/tournaments/${tournament.id}/rounds/next-swiss`, { headers });
  expect(res.ok(), await res.text()).toBeTruthy();
}

// Same path and query, but against the test server: it only listens on localhost.
const onTestServer = (url) => {
  const { pathname, search } = new URL(url);
  return `${pathname}${search}`;
};

test('QR-Code am Monitor zeigt die Live-Spielstände am Handy, Ergebnisse nur mit Admin-PIN', async ({ page, browser, request }, testInfo) => {
  await setupRound(request);
  const desktop = new TournamentDriver(page, createRng(SEED), testInfo);
  await desktop.open();

  let monitorUrl;
  await test.step('Hallen-Monitor zeigt QR-Code zur Spielstandsanzeige', async () => {
    await expect(page.getByText('2 aktive Paarungen')).toBeVisible();
    monitorUrl = await page.getByTestId('monitor-qr').getAttribute('data-url');
    expect(monitorUrl).toMatch(/^http:\/\/[^/]+\/\?tab=monitor$/);
    expect(new URL(monitorUrl).hostname, 'QR-Code zeigt auf localhost').not.toMatch(/^(localhost|127\.)/);
    await desktop.screenshot('qr-hallen-monitor');
  });

  await test.step('Spielzettel haben weder Match-PIN noch QR-Code', async () => {
    await desktop.goto('Spielzettel');
    await expect(page.getByText('BEGEGNUNG #2')).toBeVisible();
    await expect(page.getByText(/PIN/)).toHaveCount(0);
  });

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phonePage = await context.newPage();
  const phone = new TournamentDriver(phonePage, createRng(SEED + 1), testInfo);

  await test.step('Handy öffnet die Spielstände, Ergebniseingabe ist gesperrt', async () => {
    await phonePage.goto(onTestServer(monitorUrl));
    await expect(phonePage.getByText('2 aktive Paarungen')).toBeVisible();

    await phone.goto('Ergebniseingabe');
    await expect(phonePage.getByText('Admin-PIN eingeben')).toBeVisible();
    await expect(phonePage.getByTestId('match-tile')).toHaveCount(0);
    await phone.goto('Hallen-Monitor');
  });

  await test.step('Turnierleitung trägt ein Ergebnis ein, das Handy zeigt es live', async () => {
    await desktop.unlockAdmin();
    await desktop.goto('Ergebniseingabe');
    await page.locator('[data-testid="match-tile"][data-active="true"]').first().click();
    await desktop.playMatch(false);

    await expect(phonePage.getByText('1 aktive Paarungen')).toBeVisible();
    await phone.screenshot('qr-handy-spielstand');
    phone.expectNoProblems();
    desktop.expectNoProblems();
  });

  await context.close();
});
