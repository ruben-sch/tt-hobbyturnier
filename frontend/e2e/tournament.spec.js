import { test, expect } from '@playwright/test';
import { createRng, generateTeams, resolveSeed } from './support/random.js';
import { Ledger, TournamentDriver, createTournament } from './support/tournament.js';

// Full tournament day with 17 teams, driven through the UI like the organiser
// and the players would: teams, 7 Swiss rounds (one bye per round), and in the
// second scenario a Top 8 KO phase up to the final. Team names, player names
// and every game result are random; the seed is printed and attached,
// E2E_SEED=<seed> replays a run exactly.

const TEAM_COUNT = 17;
const SWISS_ROUNDS = 7;
const MATCHES_PER_ROUND = Math.floor(TEAM_COUNT / 2);
const SEED = resolveSeed();

const pad = (n) => String(n).padStart(2, '0');

async function setup(page, request, testInfo, scenario) {
  // One random stream per scenario, so both stay reproducible from one seed.
  const rng = createRng(SEED + scenario.length * 7919 + scenario.charCodeAt(0));
  testInfo.annotations.push({ type: 'seed', description: `E2E_SEED=${SEED}` });
  console.log(`[${scenario}] E2E_SEED=${SEED}`);

  await createTournament(request, {
    name: `E2E ${scenario} #${SEED}`,
    swiss_rounds_count: SWISS_ROUNDS,
  });
  const teams = generateTeams(rng, TEAM_COUNT);
  const driver = new TournamentDriver(page, rng, testInfo);
  await driver.open();
  await driver.unlockAdmin();
  await driver.addTeams(teams);
  return { driver, teams, ledger: new Ledger(teams) };
}

async function playSwissRounds(driver, teams, ledger) {
  for (let round = 1; round <= SWISS_ROUNDS; round += 1) {
    await test.step(`Runde ${round} (Schweizer System)`, async () => {
      await driver.drawSwissRound(round);
      const matches = await driver.playRound(MATCHES_PER_ROUND);

      const seen = new Set();
      for (const { teamA, teamB, games } of matches) {
        expect(ledger.hasPlayed(teamA, teamB), `Wiederholte Paarung ${teamA} – ${teamB}`).toBe(false);
        for (const name of [teamA, teamB]) {
          expect(seen.has(name), `${name} spielt zweimal in Runde ${round}`).toBe(false);
          seen.add(name);
        }
        ledger.addMatch(teamA, teamB, games);
      }
      const byeTeams = teams.map((t) => t.name).filter((name) => !seen.has(name));
      expect(byeTeams, `Freilos in Runde ${round}`).toHaveLength(1);
      expect(ledger.row(byeTeams[0]).byes, `${byeTeams[0]} hat zweimal ein Freilos`).toBe(0);
      ledger.addBye(byeTeams[0]);

      await driver.screenshotRoundResults(`runde-${pad(round)}`);
      await driver.completeRound(round);
      await expectStandings(driver, ledger, round);
      await driver.screenshotStandings(`runde-${pad(round)}`);
    });
  }
}

async function expectStandings(driver, ledger, round) {
  const standings = await driver.readStandings();
  expect(standings).toHaveLength(TEAM_COUNT);

  for (const row of standings) {
    const { rank, name, players, ...actual } = row;
    void rank; void players;
    expect(actual, `Tabellenzeile ${name} nach Runde ${round}`).toEqual(ledger.expected(name));
  }

  // Sorted by game points, then Buchholz, then set difference.
  standings.forEach((row, i) => {
    expect(row.rank).toBe(i + 1);
    if (i === 0) return;
    const prev = standings[i - 1];
    const key = (r) => [r.points, r.buchholz, r.setDiff];
    const [p, c] = [key(prev), key(row)];
    const ordered = p[0] > c[0] || (p[0] === c[0] && (p[1] > c[1] || (p[1] === c[1] && p[2] >= c[2])));
    expect(ordered, `Sortierung Platz ${i} vor ${i + 1}`).toBe(true);
  });
  return standings;
}

const pairKey = (a, b) => [a, b].sort().join(' – ');

test('17 Teams, 7 Runden Schweizer System', async ({ page, request }, testInfo) => {
  const { driver, teams, ledger } = await setup(page, request, testInfo, 'Schweizer System');
  await playSwissRounds(driver, teams, ledger);
});

test('17 Teams, 7 Runden Schweizer System und KO Top 8', async ({ page, request }, testInfo) => {
  const { driver, teams, ledger } = await setup(page, request, testInfo, 'mit KO');
  await playSwissRounds(driver, teams, ledger);

  const finalSwiss = await driver.readStandings();
  const seed = (rank) => finalSwiss[rank - 1].name;
  let round = SWISS_ROUNDS;

  const koStage = async (stage, expectedPairs, start) => {
    round += 1;
    let results;
    await test.step(`Runde ${round} (${stage})`, async () => {
      await start();
      results = await driver.playRound(expectedPairs.length, { ko: true });
      expect(results.map((m) => pairKey(m.teamA, m.teamB)).sort())
        .toEqual(expectedPairs.map(([a, b]) => pairKey(a, b)).sort());

      const prefix = `runde-${pad(round)}-${stage.toLowerCase()}`;
      await driver.screenshotRoundResults(prefix);
      await driver.completeRound(round);
      await driver.screenshotBracket(prefix, stage);
      // KO matches don't count for the Swiss table.
      await expectStandings(driver, ledger, round);
      await driver.screenshotStandings(prefix);
    });
    // Back in seeding/slot order, as the next stage pairs them.
    const winnerOf = (a, b) => results.find((m) => pairKey(m.teamA, m.teamB) === pairKey(a, b)).winner;
    return expectedPairs.map(([a, b]) => winnerOf(a, b));
  };

  // Seeding: 1–8, 4–5, 2–7, 3–6; winners of slot 1+2 and 3+4 meet in the semis.
  const qfWinners = await koStage('Viertelfinale',
    [[seed(1), seed(8)], [seed(4), seed(5)], [seed(2), seed(7)], [seed(3), seed(6)]],
    () => driver.startKo(8));
  const sfWinners = await koStage('Halbfinale',
    [[qfWinners[0], qfWinners[1]], [qfWinners[2], qfWinners[3]]],
    () => driver.advanceKo('Halbfinale'));
  const [champion] = await koStage('Finale',
    [[sfWinners[0], sfWinners[1]]],
    () => driver.advanceKo('Finale'));

  testInfo.annotations.push({ type: 'Turniersieger', description: champion });
  console.log(`Turniersieger: ${champion}`);
});
