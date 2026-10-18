import { describe, expect, it } from 'vitest';
import {
  aggregateEffortByTask,
  applyProgressDelta,
  clampProgress,
  computeProductivity,
  computeScaledProgress,
  groupLogsByDate,
  isMetricsEligible,
  roundToNumericScale,
  sumHours,
  sumProgressDelta,
} from '@/modules/time-tracking/internal/logs/metrics';
import type { DailyTaskLog } from '@/types/tracker';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function makeLog(
  overrides: Partial<DailyTaskLog> & { taskId: string; userId: string },
): DailyTaskLog {
  return {
    id: overrides.id ?? 'log-1',
    taskId: overrides.taskId,
    userId: overrides.userId,
    logDate: overrides.logDate ?? '2026-09-01',
    hoursWorked: overrides.hoursWorked ?? 1,
    progressDelta: overrides.progressDelta ?? null,
    updateNotes: overrides.updateNotes ?? null,
    rawLinks: overrides.rawLinks ?? null,
    logSource: overrides.logSource ?? 'Manual',
    sourceTimerId: overrides.sourceTimerId ?? null,
    createdAt: overrides.createdAt ?? '2026-09-01T08:00:00Z',
  };
}

/* -------------------------------------------------------------------------- */
/* roundToNumericScale                                                         */
/* -------------------------------------------------------------------------- */

describe('roundToNumericScale', () => {
  it('rounds to 2 decimal places by default', () => {
    expect(roundToNumericScale(1.234)).toBe(1.23);
    expect(roundToNumericScale(1.235)).toBe(1.24);
    expect(roundToNumericScale(1.005)).toBe(1.01); // the key bug case
  });

  it('half-away-from-zero for negative values', () => {
    expect(roundToNumericScale(-1.005)).toBe(-1.01);
    expect(roundToNumericScale(-1.004)).toBe(-1);
  });

  it('respects a custom digit count', () => {
    expect(roundToNumericScale(1.23456, 4)).toBe(1.2346);
    expect(roundToNumericScale(1.23456, 0)).toBe(1);
  });

  it('passes through non-finite values unchanged', () => {
    expect(roundToNumericScale(Infinity)).toBe(Infinity);
    expect(roundToNumericScale(-Infinity)).toBe(-Infinity);
    expect(roundToNumericScale(NaN)).toBeNaN();
  });

  it('handles zero', () => {
    expect(roundToNumericScale(0)).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* clampProgress                                                               */
/* -------------------------------------------------------------------------- */

describe('clampProgress', () => {
  it('keeps values in [0, 100]', () => {
    expect(clampProgress(50)).toBe(50);
    expect(clampProgress(0)).toBe(0);
    expect(clampProgress(100)).toBe(100);
  });

  it('clamps below 0 to 0', () => {
    expect(clampProgress(-1)).toBe(0);
    expect(clampProgress(-100)).toBe(0);
  });

  it('clamps above 100 to 100', () => {
    expect(clampProgress(101)).toBe(100);
    expect(clampProgress(200)).toBe(100);
  });

  it('rounds to 2dp before clamping', () => {
    expect(clampProgress(99.999)).toBe(100);
    expect(clampProgress(0.001)).toBe(0);
  });

  it('returns 0 for non-finite input', () => {
    // clampProgress early-returns 0 for any non-finite value (NaN, Infinity, -Infinity),
    // because roundToNumericScale would return the non-finite as-is and Math.min/max
    // would produce non-sensical results. The guard at the top catches all of them.
    expect(clampProgress(NaN)).toBe(0);
    expect(clampProgress(Infinity)).toBe(0);
    expect(clampProgress(-Infinity)).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* applyProgressDelta                                                          */
/* -------------------------------------------------------------------------- */

describe('applyProgressDelta', () => {
  it('adds a positive delta to current progress', () => {
    expect(applyProgressDelta(40, 25)).toBe(65);
  });

  it('treats null current as 0', () => {
    expect(applyProgressDelta(null, 30)).toBe(30);
  });

  it('clamps the result at 100', () => {
    expect(applyProgressDelta(90, 20)).toBe(100);
  });

  it('clamps the result at 0 for a large negative delta', () => {
    expect(applyProgressDelta(10, -50)).toBe(0);
  });

  it('handles a correction that reduces progress exactly to 0', () => {
    expect(applyProgressDelta(25, -25)).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* computeScaledProgress                                                       */
/* -------------------------------------------------------------------------- */

describe('computeScaledProgress', () => {
  it('computes scale × (progress / 100)', () => {
    expect(computeScaledProgress(40, 25)).toBe(10);
    expect(computeScaledProgress(40, 75)).toBe(30);
  });

  it('returns null when taskScale is null', () => {
    expect(computeScaledProgress(null, 50)).toBeNull();
  });

  it('returns null when progressPercentage is null', () => {
    expect(computeScaledProgress(40, null)).toBeNull();
  });

  it('returns null when both are null', () => {
    expect(computeScaledProgress(null, null)).toBeNull();
  });

  it('rounds to 2dp — agrees with PostgreSQL NUMERIC(x,2)', () => {
    // 40 × (25.5 / 100) = 10.2
    expect(computeScaledProgress(40, 25.5)).toBe(10.2);
    // 3 × (33.33 / 100) ≈ 0.9999 → 1.00
    expect(computeScaledProgress(3, 33.33)).toBeCloseTo(0.9999,10);
  });

  it('handles zero progress', () => {
    expect(computeScaledProgress(40, 0)).toBe(0);
  });

  it('handles 100% progress', () => {
    expect(computeScaledProgress(40, 100)).toBe(40);
  });
});

/* -------------------------------------------------------------------------- */
/* computeProductivity                                                         */
/* -------------------------------------------------------------------------- */

describe('computeProductivity', () => {
  it('computes task percentage points / hoursLogged', () => {
    expect(computeProductivity(10, 5)).toBe(2);
  });

  it('returns null when progress percentage is null', () => {
    expect(computeProductivity(null, 5)).toBeNull();
  });

  it('returns null when hoursLogged is 0', () => {
    expect(computeProductivity(10, 0)).toBeNull();
  });

  it('returns null when hoursLogged is negative', () => {
    expect(computeProductivity(10, -1)).toBeNull();
  });

  it('returns null for non-finite hoursLogged', () => {
    expect(computeProductivity(10, NaN)).toBeNull();
    expect(computeProductivity(10, Infinity)).toBeNull();
  });

  it('rounds to 2dp', () => {
    // 10 / 3 ≈ 3.333… → 3.33
    expect(computeProductivity(10, 3)).toBe(3.33);
  });
});

/* -------------------------------------------------------------------------- */
/* isMetricsEligible                                                           */
/* -------------------------------------------------------------------------- */

describe('isMetricsEligible',()=>{
 const eligible={priority:'Medium' as const,status:'In Progress' as const,taskScale:8,progressPercentage:15};
 it('uses the shared predicate without a rate denominator',()=>expect(isMetricsEligible(eligible)).toBe(true));
 it('excludes No priority',()=>expect(isMetricsEligible({...eligible,priority:'No'})).toBe(false));
 it('excludes missing scale',()=>expect(isMetricsEligible({...eligible,taskScale:null})).toBe(false));
 it('excludes progress below 15',()=>expect(isMetricsEligible({...eligible,progressPercentage:14.99})).toBe(false));
});

describe('sumHours', () => {
  it('sums hours across logs', () => {
    expect(sumHours([{ hoursWorked: 2 }, { hoursWorked: 3.5 }])).toBe(5.5);
  });

  it('returns 0 for an empty array', () => {
    expect(sumHours([])).toBe(0);
  });

  it('preserves intermediate hours and short positive durations', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in JS; should round to 0.30
    expect(sumHours([{ hoursWorked: 0.1 }, { hoursWorked: 0.2 }])).toBeCloseTo(0.3,12);
    expect(sumHours([{hoursWorked:2/3600}])).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* sumProgressDelta                                                            */
/* -------------------------------------------------------------------------- */

describe('sumProgressDelta', () => {
  it('sums deltas, treating null as 0', () => {
    expect(
      sumProgressDelta([{ progressDelta: 10 }, { progressDelta: null }, { progressDelta: 5 }]),
    ).toBe(15);
  });

  it('returns 0 for an empty array', () => {
    expect(sumProgressDelta([])).toBe(0);
  });

  it('handles all-null deltas', () => {
    expect(sumProgressDelta([{ progressDelta: null }, { progressDelta: null }])).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* aggregateEffortByTask                                                       */
/* -------------------------------------------------------------------------- */

describe('aggregateEffortByTask', () => {
  it('groups hours by taskId', () => {
    const logs = [
      makeLog({ taskId: 'task-a', userId: 'u1', hoursWorked: 2 }),
      makeLog({ taskId: 'task-a', userId: 'u1', hoursWorked: 3 }),
      makeLog({ taskId: 'task-b', userId: 'u1', hoursWorked: 1 }),
    ];
    const result = aggregateEffortByTask(logs);
    expect(result.get('task-a')?.hoursLogged).toBe(5);
    expect(result.get('task-a')?.logCount).toBe(2);
    expect(result.get('task-b')?.hoursLogged).toBe(1);
    expect(result.get('task-b')?.logCount).toBe(1);
  });

  it('returns an empty map for empty input', () => {
    expect(aggregateEffortByTask([])).toEqual(new Map());
  });

  it('rounds the aggregated total to 2dp', () => {
    // Three entries of 1/3 hour each
    const logs = [
      makeLog({ taskId: 'task-a', userId: 'u1', hoursWorked: 1 / 3 }),
      makeLog({ taskId: 'task-a', userId: 'u1', hoursWorked: 1 / 3 }),
      makeLog({ taskId: 'task-a', userId: 'u1', hoursWorked: 1 / 3 }),
    ];
    expect(aggregateEffortByTask(logs).get('task-a')?.hoursLogged).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* groupLogsByDate                                                             */
/* -------------------------------------------------------------------------- */

describe('groupLogsByDate', () => {
  it('groups logs into descending date buckets', () => {
    const logs: DailyTaskLog[] = [
      makeLog({ id: 'a', taskId: 't1', userId: 'u1', logDate: '2026-09-01', createdAt: '2026-09-01T09:00:00Z' }),
      makeLog({ id: 'b', taskId: 't1', userId: 'u1', logDate: '2026-09-03', createdAt: '2026-09-03T09:00:00Z' }),
      makeLog({ id: 'c', taskId: 't1', userId: 'u1', logDate: '2026-09-01', createdAt: '2026-09-01T12:00:00Z' }),
    ];
    const groups = groupLogsByDate(logs);

    // Two distinct dates
    expect(groups).toHaveLength(2);
    // Descending: Sep 03 first, Sep 01 second
    expect(groups[0]?.logDate).toBe('2026-09-03');
    expect(groups[1]?.logDate).toBe('2026-09-01');
  });

  it('orders logs within a day newest-created first', () => {
    const logs: DailyTaskLog[] = [
      makeLog({ id: 'early', taskId: 't1', userId: 'u1', logDate: '2026-09-01', createdAt: '2026-09-01T08:00:00Z' }),
      makeLog({ id: 'late', taskId: 't1', userId: 'u1', logDate: '2026-09-01', createdAt: '2026-09-01T17:00:00Z' }),
    ];
    const groups = groupLogsByDate(logs);
    expect(groups[0]?.logs[0]?.id).toBe('late');
    expect(groups[0]?.logs[1]?.id).toBe('early');
  });

  it('returns an empty array for empty input', () => {
    expect(groupLogsByDate([])).toEqual([]);
  });

  it('computes totalHours and totalProgressDelta per group', () => {
    const logs: DailyTaskLog[] = [
      makeLog({ id: 'x', taskId: 't1', userId: 'u1', logDate: '2026-09-01', hoursWorked: 3, progressDelta: 15 }),
      makeLog({ id: 'y', taskId: 't1', userId: 'u1', logDate: '2026-09-01', hoursWorked: 2, progressDelta: 10 }),
    ];
    const groups = groupLogsByDate(logs);
    expect(groups[0]?.totalHours).toBe(5);
    expect(groups[0]?.totalProgressDelta).toBe(25);
  });
});
