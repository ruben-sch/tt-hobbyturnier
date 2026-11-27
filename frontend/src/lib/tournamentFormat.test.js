import { describe, it, expect } from 'vitest';
import { isSingles, participants, pairNames, formatLabel } from './tournamentFormat';

describe('tournamentFormat', () => {
  it('tells an Einzelturnier from 2er-Teams', () => {
    expect(isSingles({ is_singles: true })).toBe(true);
    expect(isSingles(null)).toBe(false);
    expect(participants({ is_singles: true })).toBe('Spieler');
    expect(participants({})).toBe('Teams');
    expect(formatLabel({ is_singles: true, best_of_sets: 3 })).toBe('Einzel · 2 Gewinnsätze');
    expect(formatLabel({ best_of_sets: 5 })).toBe('2er-Teams · 3 Gewinnsätze');
  });

  it('names the pair only when there is a player 2', () => {
    expect(pairNames('Anna', 'Ben')).toBe('Anna & Ben');
    expect(pairNames('Anna', '')).toBeNull();
    expect(pairNames('Anna', null)).toBeNull();
  });
});
