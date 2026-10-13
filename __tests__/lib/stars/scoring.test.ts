// Historical formula regression coverage only; M07 conformance has separate fixtures.
import { describe, expect, it } from 'vitest';

import {
  attendanceIsValidForDailyStar,
  scoreDailyStarCandidate,
  selectDailyStarWinner,
} from '@/lib/stars/legacy-scoring';

describe('scoreDailyStarCandidate', () => {
  it('scores effort, progress, checklist completion, freshness, and attendance', () => {
    expect(
      scoreDailyStarCandidate({
        userId: 'u1',
        fullName: 'Alice',
        hoursLogged: 4,
        scaledProgress: 20,
        checklistCompletionPercentage: 75,
        freshnessPercentage: 50,
        attendanceValid: true,
      }),
    ).toMatchObject({
      productivity: 5,
      progressComponent: 6,
      productivityComponent: 1.25,
      checklistComponent: 15,
      freshnessComponent: 7.5,
      attendanceComponent: 10,
      score: 39.75,
    });
  });

  it('clamps percentage inputs and handles zero hours', () => {
    expect(
      scoreDailyStarCandidate({
        userId: 'u1',
        fullName: 'Alice',
        hoursLogged: 0,
        scaledProgress: 0,
        checklistCompletionPercentage: 140,
        freshnessPercentage: -20,
        attendanceValid: false,
      }),
    ).toMatchObject({
      productivity: 0,
      checklistComponent: 20,
      freshnessComponent: 0,
      attendanceComponent: 0,
      score: 20,
    });
  });
});

describe('selectDailyStarWinner', () => {
  it('selects the highest score with deterministic tie-breaks', () => {
    const winner = selectDailyStarWinner([
      {
        userId: 'bob',
        fullName: 'Bob',
        hoursLogged: 4,
        scaledProgress: 10,
        checklistCompletionPercentage: 100,
        freshnessPercentage: 100,
        attendanceValid: true,
      },
      {
        userId: 'alice',
        fullName: 'Alice',
        hoursLogged: 4,
        scaledProgress: 10,
        checklistCompletionPercentage: 100,
        freshnessPercentage: 100,
        attendanceValid: true,
      },
    ]);

    expect(winner?.userId).toBe('alice');
  });

  it('returns null when nobody has effort or valid attendance', () => {
    expect(
      selectDailyStarWinner([
        {
          userId: 'u1',
          fullName: 'Alice',
          hoursLogged: 0,
          scaledProgress: 0,
          checklistCompletionPercentage: 0,
          freshnessPercentage: 0,
          attendanceValid: false,
        },
      ]),
    ).toBeNull();
  });
});

describe('attendanceIsValidForDailyStar', () => {
  it('accepts productive attendance states and rejects away states', () => {
    expect(
      attendanceIsValidForDailyStar({
        status: 'Present',
        attendanceHours: 8,
        offHours: 0,
      }),
    ).toBe(true);
    expect(
      attendanceIsValidForDailyStar({
        status: 'Off Hours',
        attendanceHours: 0,
        offHours: 2,
      }),
    ).toBe(true);
    expect(
      attendanceIsValidForDailyStar({
        status: 'Leave',
        attendanceHours: 0,
        offHours: 0,
      }),
    ).toBe(false);
  });
});
