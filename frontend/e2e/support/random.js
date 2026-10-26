// Seeded randomness, so a failed run can be replayed with E2E_SEED=<seed>.

// Set by playwright.config.js, also for the backend.
export function resolveSeed() {
  return Number(process.env.E2E_SEED);
}

// mulberry32: tiny, fast and good enough for test data.
export function createRng(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  const pick = (list) => list[int(0, list.length - 1)];
  return { next, int, pick, chance: (p) => next() < p };
}

const FIRST_NAMES = [
  'Lukas', 'Anna', 'Jonas', 'Lea', 'Maximilian', 'Sophie', 'Felix', 'Marie', 'Paul', 'Emma',
  'Tim', 'Hannah', 'Jan', 'Laura', 'Niklas', 'Julia', 'Moritz', 'Lena', 'Florian', 'Sarah',
  'Tobias', 'Katharina', 'Stefan', 'Miriam', 'Jürgen', 'Özlem', 'Björn', 'Chloé', 'René', 'Ida',
  'Kai', 'Nele', 'Sven', 'Jördis', 'Ali', 'Merve', 'Piotr', 'Agnieszka', 'Luca', 'Giulia',
];

const LAST_NAMES = [
  'Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann',
  'Koch', 'Richter', 'Klein', 'Wolf', 'Schröder', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger',
  'Hofmann', 'Hartmann', 'Lange', 'Schmitt', 'Werner', 'Krause', 'Meier-Lüdenscheidt', 'Lehmann', 'Kaya', 'Yılmaz',
  'Nowak', 'Kowalski', 'Rossi', 'O\'Connor', 'van der Berg', 'Groß', 'Weiß', 'Köhler', 'Jäger', 'Fuchs',
];

const TEAM_PREFIXES = [
  'Topspin', 'Netzroller', 'Noppen', 'Kantenball', 'Schmetterball', 'Unterschnitt', 'Aufschlag', 'Ballonabwehr',
  'Konter', 'Rückhand', 'Vorhand', 'Flip', 'Block', 'Chop', 'Loop', 'Smash',
];

const TEAM_SUFFIXES = [
  'Titans', 'Könige', 'Freunde', 'Doctors', 'Express', '05', 'e.V.', 'Allstars',
  'Piraten', 'Füchse', 'Brüder & Schwestern', 'Senioren', 'Youngsters', 'Connection', 'United', '"Die Wilden"',
];

// Unique team names and player names: the lineup select uses names as values,
// and the standings rows are matched to teams by name.
export function generateTeams(rng, count) {
  const teamNames = new Set();
  const playerNames = new Set();
  const uniqueName = (taken, make) => {
    for (;;) {
      const name = make();
      if (!taken.has(name)) {
        taken.add(name);
        return name;
      }
    }
  };
  const player = () => uniqueName(playerNames, () => `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`);

  return Array.from({ length: count }, () => ({
    name: uniqueName(teamNames, () => `${rng.pick(TEAM_PREFIXES)} ${rng.pick(TEAM_SUFFIXES)}`),
    player1: player(),
    player2: player(),
  }));
}

// Final set count of one game with a random winner, e.g. [3, 1] or [0, 3].
export function randomGameResult(rng, setsToWin = 3) {
  const loserSets = rng.int(0, setsToWin - 1);
  return rng.chance(0.5) ? [setsToWin, loserSets] : [loserSets, setsToWin];
}
