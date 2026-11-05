import { describe, expect, it } from 'vitest';

import { levelRows, ORG_LEVEL_WIDTH } from '../client';

const count = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const sizes = (rows: unknown[][]) => rows.map(row => row.length);

describe('levelRows (5 Nov 2026: wide levels wrap)', () => {
  it('keeps a level of up to four on one row', () => {
    expect(ORG_LEVEL_WIDTH).toBe(4);
    expect(levelRows([])).toEqual([]);
    expect(levelRows(count(1))).toEqual([[1]]);
    expect(levelRows(count(4))).toEqual([[1, 2, 3, 4]]);
  });

  it('wraps wider levels into balanced rows of at most four, in order', () => {
    expect(levelRows(count(5))).toEqual([[1, 2, 3], [4, 5]]);
    expect(sizes(levelRows(count(8)))).toEqual([4, 4]);
    expect(sizes(levelRows(count(9)))).toEqual([3, 3, 3]);
    expect(sizes(levelRows(count(13)))).toEqual([4, 3, 3, 3]);
    expect(levelRows(count(13)).flat()).toEqual(count(13));
  });

  it('never leaves a row of one when a level wraps', () => {
    for (let n = 5; n <= 60; n += 1) {
      const rows = levelRows(count(n));
      expect(Math.max(...sizes(rows))).toBeLessThanOrEqual(4);
      expect(Math.min(...sizes(rows))).toBeGreaterThanOrEqual(2);
      expect(rows.flat()).toHaveLength(n);
    }
  });

  it('accepts another width', () => {
    expect(sizes(levelRows(count(7), 3))).toEqual([3, 2, 2]);
    expect(levelRows(count(2), 0)).toEqual([[1], [2]]);
  });
});
