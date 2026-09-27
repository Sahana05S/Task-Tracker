import { describe, expect, it } from 'vitest';
import {
  computeTeamAnalytics,
  currentPeriod,
  isTaskCarriedInPeriod,
  isTaskEligible,
  median,
  resolvePeriod,
  STAR_WEIGHTS,
  type AnalyticsInput,
  type AnalyticsPeriod,
} from '@/lib/analytics/engine';
import type { DailyTaskLog, Task, User } from '@/types/tracker';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function makeUser(overrides: Partial<User> & { id: string }): User {
  return {
    id: overrides.id,
    employeeId: overrides.employeeId ?? `EMP-${overrides.id}`,
    fullName: overrides.fullName ?? `User ${overrides.id}`,
    email: overrides.email ?? `${overrides.id}@test.com`,
    role: overrides.role ?? 'team_member',
    isActive: overrides.isActive ?? true,
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00Z',
  };
}

function makeTask(overrides: Partial<Task> & { id: string; taskTag: string; assigneeId: string }): Task {
  return {
    id: overrides.id,
    taskTag: overrides.taskTag,
    title: overrides.title ?? 'Test Task',
    category: overrides.category ?? 'T',
    description: null,
    comments: null,
    assigneeId: overrides.assigneeId,
    reviewerId: null,
    taskScale: 'taskScale' in overrides ? (overrides.taskScale ?? null) : 10,
    progressPercentage: overrides.progressPercentage ?? 0,
    scaledProgress: overrides.scaledProgress ?? 0,
    taskProductivity: overrides.taskProductivity ?? null,
    priority: overrides.priority ?? 'Medium',
    status: overrides.status ?? 'Not Started',
    freshness: overrides.freshness ?? 'Fresh',
    validForMetrics: overrides.validForMetrics ?? false,
    assignedDate: overrides.assignedDate ?? '2026-09-01',
    dueDate: overrides.dueDate ?? null,
    completedDate: overrides.completedDate ?? null,
    metDeadline: overrides.metDeadline ?? null,
    createdAt: overrides.createdAt ?? '2026-09-01T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-09-01T00:00:00Z',
  };
}

function makeLog(overrides: Partial<DailyTaskLog> & { taskId: string; userId: string }): DailyTaskLog {
  return {
    id: overrides.id ?? `log-${overrides.taskId}`,
    taskId: overrides.taskId,
    userId: overrides.userId,
    logDate: overrides.logDate ?? '2026-09-15',
    hoursWorked: overrides.hoursWorked ?? 1,
    progressDelta: overrides.progressDelta ?? null,
    updateNotes: overrides.updateNotes ?? null,
    rawLinks: overrides.rawLinks ?? null,
    createdAt: overrides.createdAt ?? '2026-09-15T08:00:00Z',
  };
}

const SEP_2026 = resolvePeriod(2026, 9);

/* -------------------------------------------------------------------------- */
/* resolvePeriod                                                               */
/* -------------------------------------------------------------------------- */

describe('resolvePeriod', () => {
  it('produces correct start and end dates for September', () => {
    const period = resolvePeriod(2026, 9);
    expect(period.startDate).toBe('2026-09-01');
    expect(period.endDate).toBe('2026-09-30');
    expect(period.year).toBe(2026);
    expect(period.month).toBe(9);
  });

  it('handles February in a leap year', () => {
    const period = resolvePeriod(2024, 2);
    expect(period.endDate).toBe('2024-02-29');
  });

  it('handles February in a non-leap year', () => {
    const period = resolvePeriod(2026, 2);
    expect(period.endDate).toBe('2026-02-28');
  });

  it('handles December', () => {
    const period = resolvePeriod(2026, 12);
    expect(period.startDate).toBe('2026-12-01');
    expect(period.endDate).toBe('2026-12-31');
  });

  it('produces a human-readable label', () => {
    expect(resolvePeriod(2026, 9).label).toBe('September 2026');
    expect(resolvePeriod(2026, 1).label).toBe('January 2026');
  });
});

describe('currentPeriod', () => {
  it('uses the current UTC date', () => {
    const now = new Date('2026-09-15T00:00:00Z');
    const period = currentPeriod(now);
    expect(period.year).toBe(2026);
    expect(period.month).toBe(9);
  });
});

/* -------------------------------------------------------------------------- */
/* median                                                                      */
/* -------------------------------------------------------------------------- */

describe('median', () => {
  it('returns null for an empty array', () => {
    expect(median([])).toBeNull();
  });

  it('returns the single value for a 1-element array', () => {
    expect(median([5])).toBe(5);
  });

  it('returns the middle element for an odd-length array', () => {
    expect(median([1, 3, 5])).toBe(3);
    expect(median([5, 1, 3])).toBe(3); // order shouldn't matter
  });

  it('returns the mean of the two central values for an even-length array', () => {
    expect(median([1, 3, 5, 7])).toBe(4);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('filters out non-finite values', () => {
    expect(median([1, NaN, 3, Infinity])).toBe(2);
  });

  it('returns null when all values are non-finite', () => {
    expect(median([NaN, Infinity, -Infinity])).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* isTaskEligible                                                              */
/* -------------------------------------------------------------------------- */

describe('isTaskEligible', () => {
  it('is eligible for a normal task', () => {
    const task = makeTask({ id: 't1', taskTag: 'T1', assigneeId: 'u1', taskScale: 10, category: 'T', status: 'In Progress' });
    expect(isTaskEligible(task)).toBe(true);
  });

  it('is ineligible for OT category', () => {
    const task = makeTask({ id: 't1', taskTag: 'T1', assigneeId: 'u1', category: 'OT' });
    expect(isTaskEligible(task)).toBe(false);
  });

  it('is ineligible for Discarded status', () => {
    const task = makeTask({ id: 't1', taskTag: 'T1', assigneeId: 'u1', status: 'Discarded' });
    expect(isTaskEligible(task)).toBe(false);
  });

  it('is ineligible when taskScale is null', () => {
    const task = makeTask({ id: 't1', taskTag: 'T1', assigneeId: 'u1', taskScale: null });
    expect(isTaskEligible(task)).toBe(false);
  });

  it('is ineligible when taskScale is 0', () => {
    const task = makeTask({ id: 't1', taskTag: 'T1', assigneeId: 'u1', taskScale: 0 });
    expect(isTaskEligible(task)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* isTaskCarriedInPeriod                                                       */
/* -------------------------------------------------------------------------- */

describe('isTaskCarriedInPeriod', () => {
  const period: AnalyticsPeriod = SEP_2026;

  it('carries a task assigned before the period starts', () => {
    const task = makeTask({ id: 't1', taskTag: 'T1', assigneeId: 'u1', assignedDate: '2026-08-01' });
    expect(isTaskCarriedInPeriod(task, period)).toBe(true);
  });

  it('carries a task assigned on the period start date', () => {
    const task = makeTask({ id: 't1', taskTag: 'T1', assigneeId: 'u1', assignedDate: '2026-09-01' });
    expect(isTaskCarriedInPeriod(task, period)).toBe(true);
  });

  it('carries a task assigned on the period end date', () => {
    const task = makeTask({ id: 't1', taskTag: 'T1', assigneeId: 'u1', assignedDate: '2026-09-30' });
    expect(isTaskCarriedInPeriod(task, period)).toBe(true);
  });

  it('excludes a task assigned after the period ends', () => {
    const task = makeTask({ id: 't1', taskTag: 'T1', assigneeId: 'u1', assignedDate: '2026-10-01' });
    expect(isTaskCarriedInPeriod(task, period)).toBe(false);
  });

  it('excludes a task completed before the period began', () => {
    const task = makeTask({
      id: 't1', taskTag: 'T1', assigneeId: 'u1',
      assignedDate: '2026-07-01',
      completedDate: '2026-08-31',
    });
    expect(isTaskCarriedInPeriod(task, period)).toBe(false);
  });

  it('carries a task completed during the period', () => {
    const task = makeTask({
      id: 't1', taskTag: 'T1', assigneeId: 'u1',
      assignedDate: '2026-08-01',
      completedDate: '2026-09-15',
    });
    expect(isTaskCarriedInPeriod(task, period)).toBe(true);
  });

  it('carries a task with no completedDate', () => {
    const task = makeTask({ id: 't1', taskTag: 'T1', assigneeId: 'u1', assignedDate: '2026-08-01', completedDate: null });
    expect(isTaskCarriedInPeriod(task, period)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* computeTeamAnalytics — core scenarios                                       */
/* -------------------------------------------------------------------------- */

describe('computeTeamAnalytics', () => {
  it('returns empty member list when there are no active members', () => {
    const input: AnalyticsInput = {
      members: [makeUser({ id: 'u1', isActive: false })],
      tasks: [],
      logs: [],
      period: SEP_2026,
    };
    const result = computeTeamAnalytics(input);
    expect(result.members).toHaveLength(0);
    expect(result.starPerformer).toBeNull();
  });

  it('returns null starPerformer when no one has logged hours', () => {
    const input: AnalyticsInput = {
      members: [makeUser({ id: 'u1' })],
      tasks: [makeTask({ id: 't1', taskTag: 'T1', assigneeId: 'u1' })],
      logs: [],
      period: SEP_2026,
    };
    const result = computeTeamAnalytics(input);
    expect(result.starPerformer).toBeNull();
  });

  it('computes basic productivity for a single member', () => {
    // 10-scale task, log with +20% progress delta and 4 hours
    // Scaled progress contribution = 10 × (20/100) = 2.0
    // Productivity = 2.0 / 4 = 0.5
    const member = makeUser({ id: 'u1' });
    const task = makeTask({ id: 't1', taskTag: 'T1', assigneeId: 'u1', taskScale: 10 });
    const log = makeLog({ taskId: 't1', userId: 'u1', hoursWorked: 4, progressDelta: 20 });

    const result = computeTeamAnalytics({
      members: [member],
      tasks: [task],
      logs: [log],
      period: SEP_2026,
    });

    const m = result.members[0]!;
    expect(m.hoursLogged).toBe(4);
    expect(m.eligibleHours).toBe(4);
    expect(m.scaledProgress).toBe(2);
    expect(m.productivity).toBe(0.5);
  });

  it('excludes OT hours from eligibleHours but not hoursLogged', () => {
    const member = makeUser({ id: 'u1' });
    const regularTask = makeTask({ id: 't1', taskTag: 'T1', assigneeId: 'u1', taskScale: 10, category: 'T' });
    const otTask = makeTask({ id: 't2', taskTag: 'T2', assigneeId: 'u1', taskScale: 5, category: 'OT' });

    const logs = [
      makeLog({ taskId: 't1', userId: 'u1', hoursWorked: 3, progressDelta: 20 }),
      makeLog({ id: 'log-ot', taskId: 't2', userId: 'u1', hoursWorked: 2, progressDelta: 10 }),
    ];

    const result = computeTeamAnalytics({
      members: [member],
      tasks: [regularTask, otTask],
      logs,
      period: SEP_2026,
    });

    const m = result.members[0]!;
    expect(m.hoursLogged).toBe(5);    // all hours
    expect(m.eligibleHours).toBe(3);  // OT excluded
  });

  it('excludes inactive members from analysis', () => {
    const active = makeUser({ id: 'u1', isActive: true });
    const inactive = makeUser({ id: 'u2', isActive: false });
    const task = makeTask({ id: 't1', taskTag: 'T1', assigneeId: 'u2' });

    const result = computeTeamAnalytics({
      members: [active, inactive],
      tasks: [task],
      logs: [],
      period: SEP_2026,
    });

    expect(result.members).toHaveLength(1);
    expect(result.members[0]!.userId).toBe('u1');
  });

  it('excludes logs outside the period', () => {
    const member = makeUser({ id: 'u1' });
    const task = makeTask({ id: 't1', taskTag: 'T1', assigneeId: 'u1', taskScale: 10 });
    const outOfPeriodLog = makeLog({ taskId: 't1', userId: 'u1', hoursWorked: 8, logDate: '2026-08-15' });

    const result = computeTeamAnalytics({
      members: [member],
      tasks: [task],
      logs: [outOfPeriodLog],
      period: SEP_2026,
    });

    expect(result.members[0]!.hoursLogged).toBe(0);
    expect(result.starPerformer).toBeNull();
  });

  it('awards star performer to the member with the highest composite score', () => {
    const u1 = makeUser({ id: 'u1', fullName: 'Alice' });
    const u2 = makeUser({ id: 'u2', fullName: 'Bob' });

    const t1 = makeTask({ id: 't1', taskTag: 'T1', assigneeId: 'u1', taskScale: 40, priority: 'Focus' });
    const t2 = makeTask({ id: 't2', taskTag: 'T2', assigneeId: 'u2', taskScale: 5, priority: 'Low' });

    const logs = [
      // Alice: 40-scale, +50% = 20 scaled progress, 4 hours → productivity = 5
      makeLog({ id: 'l1', taskId: 't1', userId: 'u1', hoursWorked: 4, progressDelta: 50 }),
      // Bob: 5-scale, +10% = 0.5 scaled progress, 8 hours → productivity = 0.0625
      makeLog({ id: 'l2', taskId: 't2', userId: 'u2', hoursWorked: 8, progressDelta: 10 }),
    ];

    const result = computeTeamAnalytics({
      members: [u1, u2],
      tasks: [t1, t2],
      logs,
      period: SEP_2026,
    });

    expect(result.starPerformer?.userId).toBe('u1');
    expect(result.starPerformer?.isStarPerformer).toBe(true);
  });

  it('marks exactly one member as isStarPerformer', () => {
    const u1 = makeUser({ id: 'u1' });
    const u2 = makeUser({ id: 'u2' });
    const t1 = makeTask({ id: 't1', taskTag: 'T1', assigneeId: 'u1', taskScale: 10 });
    const t2 = makeTask({ id: 't2', taskTag: 'T2', assigneeId: 'u2', taskScale: 10 });

    const result = computeTeamAnalytics({
      members: [u1, u2],
      tasks: [t1, t2],
      logs: [
        makeLog({ id: 'l1', taskId: 't1', userId: 'u1', hoursWorked: 2, progressDelta: 20 }),
        makeLog({ id: 'l2', taskId: 't2', userId: 'u2', hoursWorked: 3, progressDelta: 15 }),
      ],
      period: SEP_2026,
    });

    const stars = result.members.filter((m) => m.isStarPerformer);
    expect(stars).toHaveLength(1);
  });

  it('computes allocation percent as share of total team scale', () => {
    const u1 = makeUser({ id: 'u1' });
    const u2 = makeUser({ id: 'u2' });
    const t1 = makeTask({ id: 't1', taskTag: 'T1', assigneeId: 'u1', taskScale: 30 });
    const t2 = makeTask({ id: 't2', taskTag: 'T2', assigneeId: 'u2', taskScale: 70 });

    const result = computeTeamAnalytics({
      members: [u1, u2],
      tasks: [t1, t2],
      logs: [],
      period: SEP_2026,
    });

    const u1Perf = result.members.find((m) => m.userId === 'u1')!;
    const u2Perf = result.members.find((m) => m.userId === 'u2')!;
    expect(u1Perf.allocationPercent).toBe(30);
    expect(u2Perf.allocationPercent).toBe(70);
  });

  it('totals reflect team-wide aggregates', () => {
    const u1 = makeUser({ id: 'u1' });
    const t1 = makeTask({ id: 't1', taskTag: 'T1', assigneeId: 'u1', taskScale: 10 });

    const result = computeTeamAnalytics({
      members: [u1],
      tasks: [t1],
      logs: [makeLog({ taskId: 't1', userId: 'u1', hoursWorked: 5, progressDelta: 30 })],
      period: SEP_2026,
    });

    expect(result.totals.hoursLogged).toBe(5);
    expect(result.totals.eligibleHours).toBe(5);
    // 10 × (30/100) = 3
    expect(result.totals.scaledProgress).toBe(3);
    expect(result.totals.activeMemberCount).toBe(1);
    expect(result.totals.contributingMemberCount).toBe(1);
  });

  it('null productivity for members with no eligible hours', () => {
    // Member who only logged OT hours gets null productivity
    const u1 = makeUser({ id: 'u1' });
    const otTask = makeTask({ id: 't1', taskTag: 'T1', assigneeId: 'u1', taskScale: 5, category: 'OT' });
    const log = makeLog({ taskId: 't1', userId: 'u1', hoursWorked: 4, progressDelta: 20 });

    const result = computeTeamAnalytics({
      members: [u1],
      tasks: [otTask],
      logs: [log],
      period: SEP_2026,
    });

    expect(result.members[0]!.productivity).toBeNull();
  });

  it('STAR_WEIGHTS sum to approximately 1.0', () => {
    const sum =
      STAR_WEIGHTS.productivityDiff +
      STAR_WEIGHTS.scaledProgress +
      STAR_WEIGHTS.freshnessScore +
      STAR_WEIGHTS.rottenCount;
    expect(sum).toBeCloseTo(1.0);
  });
});
