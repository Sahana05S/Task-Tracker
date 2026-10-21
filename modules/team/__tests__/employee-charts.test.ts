import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildPresentation, viewContext, type DatedCalculation } from '@/modules/reports/client';
import { FACTORS, type AwardDay } from '@/modules/scoring/client';
import { Exact } from '@/shared/math/exact';

import { resolvePeriod } from '@/shared/time/period';
import { type MemberPerformance } from '@/modules/scoring/client';
import { EMPTY_ATTENDANCE_SUMMARY } from '@/modules/attendance/client';
import { buildEmployeeAnalyticsCharts } from '@/modules/team/internal/employee-charts';
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

describe('profile chart read model (M11 fixture)', () => {
  // October 2026 as of the 13th, member 04: 13 dated observations, one log on the
  // 13th, 13 attendance days.
  const response = JSON.parse(readFileSync('__tests__/fixtures/m11-fresh-context.json', 'utf-8'));
  const view = viewContext(response.sources.periodStart.slice(0, 7), response.sources.asOf, new Date(response.sources.asOf));
  const member = '00000000-0000-0000-0000-000000000004';
  const model = buildPresentation(response, view, member);
  const build = (extra: Partial<Parameters<typeof buildEmployeeAnalyticsCharts>[0]> = {}) =>
    buildEmployeeAnalyticsCharts({ period: view.period, performance: null, tasks: model.tasks, logs: model.logs, links: [], stars: [], employeeId: member, observations: model.series, asOfDate: view.asOfLocalDate, ...extra });

  it('gives all ten factors in engine order, each point carrying the factor median', () => {
    const charts = build();
    expect(Object.keys(charts.factorTrends)).toEqual([...FACTORS]);
    for (const factor of FACTORS) {
      expect(charts.factorTrends[factor]).toHaveLength(model.series.length);
      charts.factorTrends[factor].forEach((point, i) => {
        const median = model.series[i].calculation.members.find((m) => m.userId === member)?.factors[factor].medianExact ?? null;
        expect(point.median).toBe(median ? Exact.from(median).number() : null);
        expect(point.medianDisplay).toBe(median ? Exact.from(median).display(6) : 'Unavailable');
      });
    }
    // Sales is unmapped in this fixture: its points are gaps, not zeros.
    expect(charts.factorTrends.sales.every((p) => p.value === null && p.display === 'Unavailable')).toBe(true);
  });

  it('puts the score beside the median of available team composites, gaps when unavailable', () => {
    const charts = build();
    expect(charts.performanceScoreTrend.map((p) => p.date)).toEqual(model.series.map((p) => p.date));
    charts.performanceScoreTrend.forEach((point, i) => {
      const composites = model.series[i].calculation.members.filter((m) => m.compositeExact !== null);
      if (composites.length === 0) expect(point.median).toBeNull();
      expect(point.value).toBe(model.series[i].calculation.members.find((m) => m.userId === member)?.composite ?? null);
    });
  });

  it('charts hours per day through the as-of date only, with unrecorded attendance as null', () => {
    const attendance = [{ businessDate: '2026-10-12', available: true, attendanceHours: '8.5' }, { businessDate: '2026-10-13', available: false, attendanceHours: null }];
    const hours = build({ attendanceDays: attendance }).dailyHours;
    expect(hours.map((d) => d.date)).toEqual(Array.from({ length: 13 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`));
    expect(hours.find((d) => d.date === '2026-10-13')).toMatchObject({ taskHours: 1, attendanceHours: null });
    expect(hours.find((d) => d.date === '2026-10-12')).toMatchObject({ taskHours: 0, attendanceHours: 8.5 });
  });

  it("marks each day's daily star for this member, another member, or not yet decided", () => {
    const day = (date: string, status: AwardDay['status'], winnerId: string | null, certified = true) => ({ date, status, winnerId, certified } as AwardDay);
    const stars = build({ awardDays: [day('2026-10-01', 'completed_winner', member), day('2026-10-02', 'completed_winner', 'someone-else'), day('2026-10-03', 'completed_none', null), day('2026-10-04', 'blocked', null), day('2026-10-05', 'completed_winner', member, false)] }).starDays;
    expect(stars.slice(0, 6).map((d) => d.state)).toEqual(['star', 'other', 'none', 'waiting', 'waiting', 'pending']);
    expect(stars).toHaveLength(13);
  });

  it('spreads completed missions over every day so far and passes deadlines through', () => {
    expect(build().deadlines).toEqual([]);
    expect(build().missionsDone.every((d) => d.value === 0)).toBe(true);
    const outcomes = { tasksDoneByDate: [{ date: '2026-10-05', label: 'Oct 5', value: 2 }], deadlineOutcomes: [{ key: 'met' as const, label: 'Met deadline', value: 1 }] };
    const charts = build({ missionOutcomes: outcomes });
    expect(charts.deadlines).toEqual(outcomes.deadlineOutcomes);
    expect(charts.missionsDone).toHaveLength(13);
    expect(charts.missionsDone.filter((d) => d.value > 0)).toEqual([{ date: '2026-10-05', label: 'Oct 5', value: 2 }]);
  });
});

it('takes the score median only when every member has a score, and factor medians from the cohort', () => {
  const exact = (n: number) => Exact.from(n).json();
  const factor = (raw: number | null, median: number | null) => ({ rawValue: raw, rawExact: raw === null ? null : exact(raw), medianExact: median === null ? null : exact(median), reasons: [], sources: [] });
  const member = (userId: string, composite: number | null) => ({ userId, composite, compositeExact: composite === null ? null : exact(composite), reasons: [], factors: { productivity: factor(composite, 2) } });
  const observe = (date: string, status: string, members: unknown[]) => ({ date, calculation: { status, context: { asOfLocalDate: '2026-09-30' }, members } }) as unknown as DatedCalculation;
  const charts = buildEmployeeAnalyticsCharts({ period: SEP_2026, performance: null, tasks: [], logs: [], stars: [], links: [], employeeId: 'b', asOfDate: '2026-09-30',
    observations: [
      observe('2026-09-10', 'complete', [member('a', 1), member('b', 3), member('c', 10)]),
      observe('2026-09-11', 'incomplete', [member('a', 1), member('b', 3), member('d', null)]),
      observe('2026-09-12', 'complete', [member('a', 1), member('c', 10)]),
    ] });
  expect(charts.performanceScoreTrend[0]).toMatchObject({ date: '2026-09-10', value: 3, display: '3.00', median: 3, medianDisplay: '3.00' });
  // One member without a score: the median is unavailable, as on the dashboard.
  expect(charts.performanceScoreTrend[1]).toMatchObject({ value: 3, median: null, medianDisplay: 'Unavailable' });
  // This member absent from the day: no value, but the cohort's factor median still shows.
  expect(charts.performanceScoreTrend[2]).toMatchObject({ value: null, median: 5.5 });
  expect(charts.factorTrends.productivity[2]).toMatchObject({ value: null, median: 2 });
  expect(charts.factorTrends.productivity[0]).toMatchObject({ value: 3, median: 2, medianDisplay: '2.000000' });
  expect(charts.factorTrends.sales[0]).toMatchObject({ value: null, display: 'Unavailable', median: null });
});
