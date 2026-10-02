import { describe, expect, it } from 'vitest';

import { calculateSupportSplit } from '@/lib/task-tools/support-split';

describe('support split calculations', () => {
  it('splits effort evenly and reduces the source scale', () => {
    expect(
      calculateSupportSplit({ sourceScale: 120, mode: 'split-even' }),
    ).toEqual({
      supportScale: 60,
      sourceScaleAfterSplit: 60,
    });
  });

  it('splits uneven effort and reduces the source scale', () => {
    expect(
      calculateSupportSplit({
        sourceScale: 120,
        mode: 'split-uneven',
        amount: 45,
      }),
    ).toEqual({
      supportScale: 45,
      sourceScaleAfterSplit: 75,
    });
  });

  it('uses proportional support without changing the source scale', () => {
    expect(
      calculateSupportSplit({
        sourceScale: 200,
        mode: 'proportional',
        percentage: 25,
      }),
    ).toEqual({
      supportScale: 50,
      sourceScaleAfterSplit: null,
    });
  });

  it('uses absolute support without changing the source scale', () => {
    expect(
      calculateSupportSplit({
        sourceScale: 200,
        mode: 'absolute',
        amount: 80,
      }),
    ).toEqual({
      supportScale: 80,
      sourceScaleAfterSplit: null,
    });
  });

  it('rejects invalid split values', () => {
    expect(() =>
      calculateSupportSplit({
        sourceScale: 100,
        mode: 'split-uneven',
        amount: 150,
      }),
    ).toThrow('Support scale must be between 0 and 100.');
  });
});
