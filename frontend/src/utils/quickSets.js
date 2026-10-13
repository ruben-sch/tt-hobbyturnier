// Pure helpers for the quick set entry in TableScorer.

// Given the loser's points, return the winner's points:
// below 10 the set ends at 11, from 10:10 on (deuce) it needs a 2-point lead.
export function autoFillOpponent(value) {
  const num = parseInt(value, 10);
  if (isNaN(num) || value === '') return '';
  return num < 10 ? 11 : num + 2;
}

// Return a new sets array with `side` ('a' | 'b') of set `idx` set to `value`
// and the other side auto-filled with the winning score.
export function applyQuickScore(sets, idx, side, value) {
  const otherSide = side === 'a' ? 'b' : 'a';
  return sets.map((s, i) => {
    if (i !== idx) return s;
    const updated = { ...s, [`score_${side}`]: value };
    if (value !== '') {
      updated[`score_${otherSide}`] = String(autoFillOpponent(value));
    }
    return updated;
  });
}

// Convert form rows to the API payload, dropping incomplete sets.
export function toValidSets(sets) {
  return sets
    .filter(s => s.score_a !== '' && s.score_b !== '')
    .map(s => ({
      set_number: s.set_number,
      score_a: parseInt(s.score_a, 10),
      score_b: parseInt(s.score_b, 10),
    }));
}
