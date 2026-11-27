// Einzelturnier (is_singles): a "team" is one player, named after them, and a
// match is one game whose set count is the match score. 2er-Teams play 4 singles.

export const isSingles = (tournament) => Boolean(tournament?.is_singles);

// What the participants are called: Spieler in an Einzelturnier, else Teams.
export const participants = (tournament) => (isSingles(tournament) ? 'Spieler' : 'Teams');

// "A & B" under a 2er-Team; null for a player, whose player 2 is empty.
export const pairNames = (p1, p2) => (p2 ? `${p1} & ${p2}` : null);

// Short description for cards and headers, e.g. "Einzel · 3 Gewinnsätze".
export const formatLabel = (tournament) =>
  `${isSingles(tournament) ? 'Einzel' : '2er-Teams'} · ${tournament?.best_of_sets === 3 ? 2 : 3} Gewinnsätze`;
