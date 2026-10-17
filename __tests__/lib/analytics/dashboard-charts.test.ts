import { describe, expect, it } from 'vitest';

import { buildWorkbookDashboardCharts } from '@/lib/analytics/dashboard-charts';
import {
  resolvePeriod,
  type MemberPerformance,
  type TeamAnalytics,
} from '@/lib/analytics/engine';
import { EMPTY_ATTENDANCE_SUMMARY } from '@/modules/attendance/client';
import type { Task, User } from '@/types/tracker';

const SEP_2026 = resolvePeriod(2026, 9);

function makeUser(overrides: Partial<User> & { id: string; fullName: string }): User {
  return {
    id: overrides.id,
    employeeId: overrides.employeeId ?? `EMP-${overrides.id}`,
    fullName: overrides.fullName,
    email: overrides.email ?? `${overrides.id}@test.com`,
    role: overrides.role ?? 'team_member',
    isActive: overrides.isActive ?? true,
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00Z',
  };
}

function makeTask(
  overrides: Partial<Task> & { id: string; taskTag: string; assigneeId: string },
): Task {
  return {
    id: overrides.id,
    taskTag: overrides.taskTag,
    title: overrides.title ?? 'Test task',
    category: overrides.category ?? 'T',
    description: overrides.description ?? null,
    comments: overrides.comments ?? null,
    assigneeId: overrides.assigneeId,
    reviewerId: overrides.reviewerId ?? null,
    assigneeIds: overrides.assigneeIds ?? [overrides.assigneeId],
    reviewerIds: overrides.reviewerIds ?? [],
    taskScale: overrides.taskScale ?? 100,
    progressPercentage: overrides.progressPercentage ?? 0,
    scaledProgress: overrides.scaledProgress ?? 0,
    taskProductivity: overrides.taskProductivity ?? null,
    priority: overrides.priority ?? 'Medium',
    status: overrides.status ?? 'In Progress',
    freshness: overrides.freshness ?? 'Fresh',
    validForMetrics: overrides.validForMetrics ?? true,
    assignedDate: overrides.assignedDate ?? '2026-09-01',
    dueDate: overrides.dueDate ?? null,
    completedDate: overrides.completedDate ?? null,
    metDeadline: overrides.metDeadline ?? null,
    createdAt: overrides.createdAt ?? '2026-09-01T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-09-01T00:00:00Z',
  };
}

function makeMemberPerformance(
  overrides: Partial<MemberPerformance> & {
    userId: string;
    fullName: string;
    starScore: number;
  },
): MemberPerformance {
  return {
    userId: overrides.userId,
    fullName: overrides.fullName,
    employeeId: overrides.employeeId ?? `EMP-${overrides.userId}`,
    role: overrides.role ?? 'team_member',
    hoursLogged: overrides.hoursLogged ?? 0,
    eligibleHours: overrides.eligibleHours ?? 0,
    scaledProgress: overrides.scaledProgress ?? 0,
    productivity: overrides.productivity ?? null,
    productivityDiff: overrides.productivityDiff ?? null,
    taskScale: overrides.taskScale ?? 0,
    allocationPercent: overrides.allocationPercent ?? 0,
    loadingDiff: overrides.loadingDiff ?? null,
    criticalityScore: overrides.criticalityScore ?? null,
    criticalityDiff: overrides.criticalityDiff ?? null,
    freshnessScore: overrides.freshnessScore ?? null,
    freshCount: overrides.freshCount ?? 0,
    staleCount: overrides.staleCount ?? 0,
    rottenCount: overrides.rottenCount ?? 0,
    taskCount: overrides.taskCount ?? 0,
    starScore: overrides.starScore,
    starBreakdown: overrides.starBreakdown ?? {
      productivityDiff: 0,
      scaledProgress: 0,
      freshnessScore: 0,
      rottenPenalty: 0,
    },
    isStarPerformer: overrides.isStarPerformer ?? false,
    attendance: overrides.attendance ?? EMPTY_ATTENDANCE_SUMMARY,
  };
}

function makeAnalytics(members: readonly MemberPerformance[]): TeamAnalytics {
  return {
    period: SEP_2026,
    members: [...members],
    medians: {
      productivity: null,
      allocationPercent: null,
      criticalityScore: null,
    },
    totals: {
      hoursLogged: 0,
      eligibleHours: 0,
      scaledProgress: 0,
      taskScale: 0,
      averageProductivity: null,
      allocationSpread: 0,
      activeMemberCount: members.length,
      contributingMemberCount: 0,
      eligibleTaskCount: 0,
      rottenTaskCount: 0,
      attendanceHours: 0,
      offHours: 0,
      payableDays: 0,
      absentDays: 0,
      leaveDays: 0,
    },
    starPerformer: members[0] ?? null,
  };
}

describe('buildWorkbookDashboardCharts', () => {
  it('builds workbook dashboard buckets from task and performance data', () => {
    const users = [
      makeUser({ id: 'alice', fullName: 'Alice Admin' }),
      makeUser({ id: 'bob', fullName: 'Bob Builder' }),
    ];
    const tasks = [
      makeTask({
        id: 't1',
        taskTag: 'Sep26_T1',
        assigneeId: 'alice',
        assigneeIds: ['alice', 'bob'],
        priority: 'High',
        category: 'T',
        scaledProgress: 50,
        dueDate: '2026-09-10',
      }),
      makeTask({
        id: 't2',
        taskTag: 'Sep26_T2',
        assigneeId: 'bob',
        priority: 'Medium',
        category: 'MKT',
        status: 'Done',
        scaledProgress: 75,
        dueDate: '2026-09-10',
        completedDate: '2026-09-08',
        metDeadline: true,
      }),
      makeTask({
        id: 't3',
        taskTag: 'Sep26_T3',
        assigneeId: 'alice',
        priority: 'Focus',
        category: 'PJT',
        status: 'Done',
        scaledProgress: 100,
        dueDate: '2026-09-05',
        completedDate: '2026-09-12',
        metDeadline: false,
      }),
      makeTask({
        id: 'old',
        taskTag: 'Aug26_T1',
        assigneeId: 'alice',
        assignedDate: '2026-08-01',
        completedDate: '2026-08-20',
        status: 'Done',
      }),
    ];
    const analytics = makeAnalytics([
      makeMemberPerformance({
        userId: 'alice',
        fullName: 'Alice Admin',
        starScore: 10,
      }),
      makeMemberPerformance({
        userId: 'bob',
        fullName: 'Bob Builder',
        starScore: -2,
      }),
    ]);

    const charts = buildWorkbookDashboardCharts({
      analytics,
      members: users,
      tasks,
      period: SEP_2026,
    });

    expect(charts.performanceWithMedian.median).toBe(4);
    expect(charts.taskPriorities.find((bucket) => bucket.key === 'Focus')?.value).toBe(1);
    expect(charts.taskPriorities.find((bucket) => bucket.key === 'High')?.value).toBe(1);
    expect(charts.taskStatuses.find((bucket) => bucket.key === 'Done')?.value).toBe(2);
    expect(charts.taskAssignees).toEqual([
      { userId: 'alice', label: 'Alice Admin', value: 2 },
      { userId: 'bob', label: 'Bob Builder', value: 2 },
    ]);
    expect(charts.taskTypes.find((bucket) => bucket.key === 'T')?.value).toBe(1);
    expect(charts.tasksDoneByDate).toEqual([
      { date: '2026-09-08', label: 'Sep 8', value: 1 },
      { date: '2026-09-12', label: 'Sep 12', value: 1 },
    ]);
    expect(charts.deadlineOutcomes).toEqual([
      { key: 'met', label: 'Met deadline', value: 1 },
      { key: 'missed', label: 'Missed deadline', value: 1 },
      { key: 'open', label: 'Open overdue', value: 1 },
    ]);
    expect(charts.priorityLoadingOnTeam).toEqual([]);
    expect(charts.priorityLoadingUnavailableReason).toContain('shared performance context');
    expect(charts.totalProgressByTeam).toEqual([
      { userId: 'alice', label: 'Alice Admin', value: 150, taskCount: 2 },
      { userId: 'bob', label: 'Bob Builder', value: 125, taskCount: 2 },
    ]);
    expect(charts.summary).toEqual({
      trackedTaskCount: 3,
      completedTaskCount: 2,
      overdueOpenTaskCount: 1,
    });
  });

  it('returns zeroed buckets when there are no tasks or members', () => {
    const charts = buildWorkbookDashboardCharts({
      analytics: makeAnalytics([]),
      members: [],
      tasks: [],
      period: SEP_2026,
    });

    expect(charts.performanceWithMedian.median).toBeNull();
    expect(charts.performanceWithMedian.members).toEqual([]);
    expect(charts.taskPriorities.every((bucket) => bucket.value === 0)).toBe(true);
    expect(charts.taskStatuses.every((bucket) => bucket.value === 0)).toBe(true);
    expect(charts.taskAssignees).toEqual([]);
    expect(charts.taskTypes.every((bucket) => bucket.value === 0)).toBe(true);
    expect(charts.tasksDoneByDate).toEqual([]);
    expect(charts.deadlineOutcomes).toEqual([
      { key: 'met', label: 'Met deadline', value: 0 },
      { key: 'missed', label: 'Missed deadline', value: 0 },
      { key: 'open', label: 'Open overdue', value: 0 },
    ]);
    expect(charts.summary).toEqual({
      trackedTaskCount: 0,
      completedTaskCount: 0,
      overdueOpenTaskCount: 0,
    });
  });
});

it('distributes configured scaled-progress chart credit without duplicating the total', () => {
  const task = {...makeTask({id:'s',taskTag:'S1',assigneeId:'a',assigneeIds:['a','b'],scaledProgress:4}),
    participantCreditMode:'configured' as const,participantShares:{a:400000,b:600000}};
  const charts=buildWorkbookDashboardCharts({period:SEP_2026,analytics:makeAnalytics([]),
    members:[makeUser({id:'a',fullName:'A'}),makeUser({id:'b',fullName:'B'})],tasks:[task]});
  expect(charts.totalProgressByTeam.map((entry) => entry.value).sort()).toEqual([1.6,2.4]);
});

it('counts open work as overdue only when due before the live as-of date', () => {
  const open=(id:string,dueDate:string)=>makeTask({id,taskTag:id,assigneeId:'a',status:'In Progress',dueDate,completedDate:null,metDeadline:null});
  const input={period:SEP_2026,analytics:makeAnalytics([]),members:[makeUser({id:'a',fullName:'A'})],
    tasks:[open('due-before',  '2026-09-10'),open('due-later','2026-09-25')]};
  const live=buildWorkbookDashboardCharts({...input,asOfDate:'2026-09-15'});
  expect(live.summary.overdueOpenTaskCount).toBe(1);
  // A past month (as-of after it ended) keeps the period-end boundary.
  expect(buildWorkbookDashboardCharts({...input,asOfDate:'2026-10-15'}).summary.overdueOpenTaskCount).toBe(2);
  expect(buildWorkbookDashboardCharts(input).summary.overdueOpenTaskCount).toBe(2);
  // Work archived by the as-of date (e.g. a carryover predecessor) is not open.
  const archived={...open('handed-off','2026-09-05'),archivedEffectiveDate:'2026-09-12'};
  expect(buildWorkbookDashboardCharts({...input,tasks:[archived],asOfDate:'2026-09-15'}).summary.overdueOpenTaskCount).toBe(0);
  expect(buildWorkbookDashboardCharts({...input,tasks:[archived],asOfDate:'2026-09-10'}).summary.overdueOpenTaskCount).toBe(1);
});
