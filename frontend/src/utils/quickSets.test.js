import { describe, it, expect } from 'vitest';
import { autoFillOpponent, applyQuickScore, toValidSets } from './quickSets';

const emptySets = () => [1, 2, 3].map(n => ({ set_number: n, score_a: '', score_b: '' }));

describe('autoFillOpponent', () => {
  it('fills 11 when the loser has fewer than 10 points', () => {
    expect(autoFillOpponent('0')).toBe(11);
    expect(autoFillOpponent('7')).toBe(11);
    expect(autoFillOpponent('9')).toBe(11);
  });

  it('adds 2 points from deuce on', () => {
    expect(autoFillOpponent('10')).toBe(12);
    expect(autoFillOpponent('14')).toBe(16);
  });

  it('returns empty for empty or non-numeric input', () => {
    expect(autoFillOpponent('')).toBe('');
    expect(autoFillOpponent('abc')).toBe('');
  });
});

describe('applyQuickScore', () => {
  it('sets the entered side and auto-fills the other', () => {
    const result = applyQuickScore(emptySets(), 1, 'b', '8');
    expect(result[1]).toEqual({ set_number: 2, score_a: '11', score_b: '8' });
  });

  it('does not mutate the input array or its rows', () => {
    const sets = emptySets();
    const result = applyQuickScore(sets, 0, 'a', '5');
    expect(sets[0]).toEqual({ set_number: 1, score_a: '', score_b: '' });
    expect(result).not.toBe(sets);
    expect(result[1]).toBe(sets[1]);
  });

  it('clearing a field keeps the other side unchanged', () => {
    const filled = applyQuickScore(emptySets(), 0, 'a', '5');
    const cleared = applyQuickScore(filled, 0, 'a', '');
    expect(cleared[0]).toEqual({ set_number: 1, score_a: '', score_b: '11' });
  });
});

describe('toValidSets', () => {
  it('keeps only complete sets and parses numbers', () => {
    const sets = [
      { set_number: 1, score_a: '11', score_b: '7' },
      { set_number: 2, score_a: '12', score_b: '' },
      { set_number: 3, score_a: '9', score_b: '11' },
    ];
    expect(toValidSets(sets)).toEqual([
      { set_number: 1, score_a: 11, score_b: 7 },
      { set_number: 3, score_a: 9, score_b: 11 },
    ]);
  });
});
