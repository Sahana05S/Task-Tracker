import { describe, expect, it } from 'vitest';

import { resolvePeriod, type MemberPerformance } from '@/lib/analytics/engine';
import { EMPTY_ATTENDANCE_SUMMARY } from '@/lib/attendance/summary';
import { buildEmployeeAnalyticsCharts } from '@/lib/team/employee-charts';
import type { DailyTaskLog, Task, TaskLink } from '@/types/tracker';

const SEP_2026 = resolvePeriod(2026, 9);

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
    progressPercentage: overrides.progressPercentage ?? 20,
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

function makeLog(overrides: Partial<DailyTaskLog> & { taskId: string }): DailyTaskLog {
  return {
    id: overrides.id ?? `log-${overrides.taskId}-${overrides.logDate}`,
    taskId: overrides.taskId,
    userId: overrides.userId ?? 'user-1',
    logDate: overrides.logDate ?? '2026-09-01',
    hoursWorked: overrides.hoursWorked ?? 1,
    progressDelta: overrides.progressDelta ?? 0,
    updateNotes: overrides.updateNotes ?? null,
    rawLinks: overrides.rawLinks ?? null,
    logSource: overrides.logSource ?? 'Manual',
    sourceTimerId: overrides.sourceTimerId ?? null,
    createdAt: overrides.createdAt ?? '2026-09-01T00:00:00Z',
  };
}

function makeLink(overrides: Partial<TaskLink> & { taskId: string }): TaskLink {
  return {
    id: overrides.id ?? `link-${overrides.taskId}`,
    taskId: overrides.taskId,
    linkType: overrides.linkType ?? 'Document',
    label: overrides.label ?? 'Document',
    url: overrides.url ?? 'https://example.com',
    storagePath: overrides.storagePath ?? null,
    notes: overrides.notes ?? null,
    createdBy: overrides.createdBy ?? null,
    createdAt: overrides.createdAt ?? '2026-09-01T00:00:00Z',
  };
}

function makePerformance(starScore: number): MemberPerformance {
  return {
    userId: 'user-1',
    fullName: 'Test User',
    employeeId: 'EMP-1',
    role: 'team_member',
    hoursLogged: 0,
    eligibleHours: 0,
    scaledProgress: 0,
    productivity: null,
    productivityDiff: null,
    taskScale: 0,
    allocationPercent: 0,
    loadingDiff: null,
    criticalityScore: null,
    criticalityDiff: null,
    freshnessScore: null,
    freshCount: 0,
    staleCount: 0,
    rottenCount: 0,
    taskCount: 0,
    starScore,
    starBreakdown: {
      productivityDiff: 0,
      scaledProgress: 0,
      freshnessScore: 0,
      rottenPenalty: 0,
    },
    isStarPerformer: false,
    attendance: EMPTY_ATTENDANCE_SUMMARY,
  };
}

describe('buildEmployeeAnalyticsCharts', () => {
  it('calculates employee trend and distribution chart data', () => {
    const tasks = [
      makeTask({
        id: 'task-1',
        taskTag: 'Sep26_T1',
        assigneeId: 'user-1',
        category: 'T',
        priority: 'High',
        taskScale: 100,
        freshness: 'Fresh',
      }),
      makeTask({
        id: 'task-2',
        taskTag: 'Sep26_T2',
        assigneeId: 'user-1',
        assignedDate: '2026-09-05',
        completedDate: '2026-09-10',
        status: 'Done',
        category: 'MKT',
        priority: 'Medium',
        taskScale: 50,
        freshness: 'Stale',
      }),
    ];
    const charts = buildEmployeeAnalyticsCharts({
      period: SEP_2026,
      performance: null,
      tasks,
      logs: [
        makeLog({
          taskId: 'task-1',
          logDate: '2026-09-02',
          hoursWorked: 2,
          progressDelta: 10,
        }),
        makeLog({
          taskId: 'task-2',
          logDate: '2026-09-06',
          hoursWorked: 1,
          progressDelta: 20,
        }),
      ],
      stars: [
        {
          id: 'star-1',
          starDate: '2026-09-02',
          userId: 'user-1',
          score: 3,
          productivityComponent: 0,
          progressComponent: 0,
          checklistComponent: 0,
          freshnessComponent: 0,
          attendanceComponent: 0,
          reason: null,
          isOverride: false,
          overrideBy: null,
          createdAt: '2026-09-02T00:00:00Z',
          updatedAt: '2026-09-02T00:00:00Z',
        },
        {
          id: 'star-2',
          starDate: '2026-09-06',
          userId: 'user-1',
          score: 4,
          productivityComponent: 0,
          progressComponent: 0,
          checklistComponent: 0,
          freshnessComponent: 0,
          attendanceComponent: 0,
          reason: null,
          isOverride: false,
          overrideBy: null,
          createdAt: '2026-09-06T00:00:00Z',
          updatedAt: '2026-09-06T00:00:00Z',
        },
      ],
      links: [makeLink({ taskId: 'task-1', linkType: 'Document' })],
    });

    expect(charts.performanceScoreTrend).toEqual([]); // Legacy winner records are not calculated candidate history.
    // M11: current tasks and logs cannot certify past factor observations.
    expect([charts.productivityTrend,charts.progressTrend,charts.completionTrend,charts.loadingTrend,charts.criticalityTrend]).toEqual([[],[],[],[],[]]);
    expect(charts.taskTypes.find((bucket) => bucket.key === 'T')?.value).toBe(1);
    expect(charts.taskTypes.find((bucket) => bucket.key === 'MKT')?.value).toBe(1);
    expect(charts.taskPriorities.find((bucket) => bucket.key === 'High')?.value).toBe(1);
    expect(charts.taskStatuses.find((bucket) => bucket.key === 'Done')?.value).toBe(1);
    expect(charts.taskFreshness.find((bucket) => bucket.key === 'Stale')?.value).toBe(1);
    expect(charts.taskDocumentation.find((bucket) => bucket.key === 'Document')?.value).toBe(1);
    expect(charts.taskDocumentation.find((bucket) => bucket.key === 'Missing')?.value).toBe(1);
  });

  it('keeps daily score history empty without actual candidate observations', () => {
    const charts = buildEmployeeAnalyticsCharts({
      period: SEP_2026,
      performance: makePerformance(12.5),
      tasks: [],
      logs: [],
      stars: [],
      links: [],
    });

    expect(charts.performanceScoreTrend).toEqual([]);
    expect(charts.productivityTrend).toEqual([]);
    expect(charts.progressTrend).toEqual([]);
    expect(charts.completionTrend).toEqual([]);
    expect(charts.loadingTrend).toEqual([]);
    expect(charts.criticalityTrend).toEqual([]);
    expect(charts.taskTypes.every((bucket) => bucket.value === 0)).toBe(true);
    expect(charts.taskPriorities.every((bucket) => bucket.value === 0)).toBe(true);
    expect(charts.taskStatuses.every((bucket) => bucket.value === 0)).toBe(true);
    expect(charts.taskFreshness.every((bucket) => bucket.value === 0)).toBe(true);
    expect(charts.taskDocumentation.every((bucket) => bucket.value === 0)).toBe(true);
  });
});

it('leaves unsettled shared daily-credit trends unavailable rather than fabricating values', () => {
  const task={...makeTask({id:'s',taskTag:'S1',assigneeId:'a'}),participantCreditMode:'configured' as const,
    participantShares:{a:400000,b:600000}};
  const charts=buildEmployeeAnalyticsCharts({period:SEP_2026,performance:null,tasks:[task],logs:[],stars:[],links:[]});
  expect([charts.progressTrend,charts.productivityTrend,charts.loadingTrend,charts.completionTrend,charts.criticalityTrend]).toEqual([[],[],[],[],[]]);
  expect(charts.taskTypes.some((bucket) => bucket.value>0)).toBe(true);
});
