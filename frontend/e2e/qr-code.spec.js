import { test, expect } from '@playwright/test';
import { createRng, generateTeams, resolveSeed } from './support/random.js';
import { ADMIN_PIN, TournamentDriver, createTournament } from './support/tournament.js';

// Players scan a QR code on the Hallen-Monitor or on their match sheet and
// enter results on their phone. The QR codes must point at the server's LAN
// address (not localhost) and the sheet's code straight at its match.

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

test('QR-Codes führen vom Monitor und Spielzettel zur Ergebniseingabe am Handy', async ({ page, browser, request }, testInfo) => {
  await setupRound(request);
  const desktop = new TournamentDriver(page, createRng(SEED), testInfo);
  await desktop.open();

  await test.step('Hallen-Monitor zeigt QR-Code zur Ergebniseingabe', async () => {
    await expect(page.getByText('2 aktive Paarungen')).toBeVisible();
    const url = await page.getByTestId('scorer-qr').getAttribute('data-url');
    expect(url).toMatch(/^http:\/\/[^/]+\/\?tab=scorer$/);
    expect(new URL(url).hostname, 'QR-Code zeigt auf localhost').not.toMatch(/^(localhost|127\.)/);
    await desktop.screenshot('qr-hallen-monitor');
  });

  let sheetUrl;
  let sheetText;
  await test.step('Jeder Spielzettel hat einen eigenen QR-Code zu seiner Begegnung', async () => {
    await desktop.goto('Spielzettel');
    const codes = page.getByTestId('sheet-qr');
    await expect(codes).toHaveCount(2);
    const urls = await codes.evaluateAll((svgs) => svgs.map((s) => s.getAttribute('data-url')));
    for (const url of urls) expect(url).toMatch(/^http:\/\/[^/]+\/\?tab=scorer&match=\d+$/);
    expect(new Set(urls).size).toBe(2);
    [sheetUrl] = urls;
    sheetText = await codes.first().locator('xpath=ancestor::div[contains(@class, "bg-white")][1]').textContent();
  });

  await test.step('Handy öffnet die Begegnung vom Spielzettel und trägt das Ergebnis ein', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const phonePage = await context.newPage();
    const phone = new TournamentDriver(phonePage, createRng(SEED + 1), testInfo);
    await phonePage.goto(onTestServer(sheetUrl));

    const { teamA, teamB } = await phone.playMatch(false);
    expect(sheetText).toContain(teamA);
    expect(sheetText).toContain(teamB);
    await phone.screenshot('qr-handy-ergebnis');
    phone.expectNoProblems();
    await context.close();
  });

  await test.step('Monitor zeigt das eingetragene Ergebnis', async () => {
    await desktop.goto('Hallen-Monitor');
    await expect(page.getByText('1 aktive Paarungen')).toBeVisible();
    desktop.expectNoProblems();
  });
});
