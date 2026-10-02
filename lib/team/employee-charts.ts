import { roundToNumericScale } from '@/lib/logs/metrics';
import {
  CATEGORY_LABELS,
  PRIORITY_WEIGHTS,
  TASK_CATEGORIES,
  TASK_FRESHNESS_STATES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@/lib/tracker/enums';
import type {
  AnalyticsPeriod,
  MemberPerformance,
} from '@/lib/analytics/engine';
import type {
  DailyStarRecord,
  DailyTaskLog,
  Task,
  TaskLink,
  TaskLinkType,
} from '@/types/tracker';

export interface EmployeeTrendPoint {
  date: string;
  label: string;
  value: number;
}

export interface EmployeeDistributionBucket {
  key: string;
  label: string;
  value: number;
}

export interface EmployeeAnalyticsCharts {
  performanceScoreTrend: EmployeeTrendPoint[];
  productivityTrend: EmployeeTrendPoint[];
  progressTrend: EmployeeTrendPoint[];
  completionTrend: EmployeeTrendPoint[];
  loadingTrend: EmployeeTrendPoint[];
  criticalityTrend: EmployeeTrendPoint[];
  taskTypes: EmployeeDistributionBucket[];
  taskPriorities: EmployeeDistributionBucket[];
  taskStatuses: EmployeeDistributionBucket[];
  taskDocumentation: EmployeeDistributionBucket[];
  taskFreshness: EmployeeDistributionBucket[];
}

export interface EmployeeAnalyticsChartInput {
  period: AnalyticsPeriod;
  performance: MemberPerformance | null;
  tasks: readonly Task[];
  logs: readonly DailyTaskLog[];
  stars: readonly DailyStarRecord[];
  links: readonly TaskLink[];
}

const TASK_LINK_TYPES = [
  'Folder',
  'Document',
  'Account',
  'Flowchart',
  'Engineering',
  'Drawing',
  'Checklist',
  'Raw Link',
  'Other',
] as const satisfies readonly TaskLinkType[];

export function buildEmployeeAnalyticsCharts({
  period,
  performance,
  tasks,
  logs,
  stars,
  links,
}: EmployeeAnalyticsChartInput): EmployeeAnalyticsCharts {
  const dates = datesInPeriod(period);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const logsByDate = groupBy(logs, (log) => log.logDate);
  const starsByDate = groupBy(stars, (star) => star.starDate);
  const linksByTask = groupBy(links, (link) => link.taskId);
  const performanceScoreTrend = trendFromDates(
    dates,
    (date) => sum(starsByDate.get(date) ?? [], (star) => star.score),
    { omitZeroOnly: true },
  );

  return {
    performanceScoreTrend:
      performanceScoreTrend.length > 0 || performance === null
        ? performanceScoreTrend
        : [
            {
              date: period.endDate,
              label: formatShortDate(period.endDate),
              value: performance.starScore,
            },
          ],
    productivityTrend: trendFromDates(
      dates,
      (date) => productivityForLogs(logsByDate.get(date) ?? [], taskById),
      { omitNull: true },
    ),
    progressTrend: cumulativeTrendFromDates(dates, (date) =>
      progressForLogs(logsByDate.get(date) ?? [], taskById),
    ),
    completionTrend: cumulativeTrendFromDates(
      dates,
      (date) =>
        tasks.filter(
          (task) => task.status === 'Done' && task.completedDate === date,
        ).length,
    ),
    loadingTrend: trendFromDates(
      dates,
      (date) => loadingOnDate(tasks, date),
      { omitZeroOnly: true },
    ),
    criticalityTrend: trendFromDates(
      dates,
      (date) => criticalityOnDate(tasks, date),
      { omitNull: true },
    ),
    taskTypes: TASK_CATEGORIES.map((category) => ({
      key: category,
      label: CATEGORY_LABELS[category],
      value: countTasks(tasks, (task) => task.category === category),
    })),
    taskPriorities: TASK_PRIORITIES.map((priority) => ({
      key: priority,
      label: priority,
      value: countTasks(tasks, (task) => task.priority === priority),
    })),
    taskStatuses: TASK_STATUSES.map((status) => ({
      key: status,
      label: status,
      value: countTasks(tasks, (task) => task.status === status),
    })),
    taskDocumentation: [
      ...TASK_LINK_TYPES.map((linkType) => ({
        key: linkType,
        label: linkType,
        value: links.filter((link) => link.linkType === linkType).length,
      })),
      {
        key: 'Missing',
        label: 'No documentation',
        value: tasks.filter((task) => !linksByTask.has(task.id)).length,
      },
    ],
    taskFreshness: TASK_FRESHNESS_STATES.map((freshness) => ({
      key: freshness,
      label: freshness,
      value: countTasks(tasks, (task) => task.freshness === freshness),
    })),
  };
}

function trendFromDates(
  dates: readonly string[],
  getValue: (date: string) => number | null,
  options: { omitNull?: boolean; omitZeroOnly?: boolean } = {},
): EmployeeTrendPoint[] {
  const points = dates
    .map((date) => {
      const value = getValue(date);
      if (value === null && options.omitNull) return null;
      return {
        date,
        label: formatShortDate(date),
        value: roundToNumericScale(value ?? 0),
      };
    })
    .filter((point): point is EmployeeTrendPoint => point !== null);

  if (options.omitZeroOnly && points.every((point) => point.value === 0)) {
    return [];
  }

  return points;
}

function cumulativeTrendFromDates(
  dates: readonly string[],
  getDelta: (date: string) => number,
): EmployeeTrendPoint[] {
  let total = 0;
  const points = dates.map((date) => {
    total += getDelta(date);
    return {
      date,
      label: formatShortDate(date),
      value: roundToNumericScale(total),
    };
  });

  return total === 0 ? [] : points;
}

function productivityForLogs(
  logs: readonly DailyTaskLog[],
  taskById: ReadonlyMap<string, Task>,
): number | null {
  const hours = sum(logs, (log) => log.hoursWorked);
  if (hours <= 0) return null;

  return roundToNumericScale(progressForLogs(logs, taskById) / hours);
}

function progressForLogs(
  logs: readonly DailyTaskLog[],
  taskById: ReadonlyMap<string, Task>,
): number {
  return roundToNumericScale(
    sum(logs, (log) => {
      const taskScale = taskById.get(log.taskId)?.taskScale ?? 0;
      return taskScale * ((log.progressDelta ?? 0) / 100);
    }),
  );
}

function loadingOnDate(tasks: readonly Task[], date: string): number {
  return roundToNumericScale(
    sum(
      tasks.filter((task) => carriesTaskOnDate(task, date)),
      (task) => task.taskScale ?? 0,
    ),
  );
}

function criticalityOnDate(tasks: readonly Task[], date: string): number | null {
  const carriedTasks = tasks.filter((task) => carriesTaskOnDate(task, date));
  if (carriedTasks.length === 0) return null;

  return roundToNumericScale(
    sum(carriedTasks, (task) => PRIORITY_WEIGHTS[task.priority]) /
      carriedTasks.length,
  );
}

function carriesTaskOnDate(task: Task, date: string): boolean {
  if (task.assignedDate > date) return false;
  if (task.completedDate !== null && task.completedDate < date) return false;
  return true;
}

function countTasks(
  tasks: readonly Task[],
  predicate: (task: Task) => boolean,
): number {
  return tasks.reduce((count, task) => count + (predicate(task) ? 1 : 0), 0);
}

function datesInPeriod(period: AnalyticsPeriod): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${period.startDate}T00:00:00Z`);
  const end = new Date(`${period.endDate}T00:00:00Z`);

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function groupBy<Item>(
  items: readonly Item[],
  getKey: (item: Item) => string,
): Map<string, Item[]> {
  const groups = new Map<string, Item[]>();

  for (const item of items) {
    const key = getKey(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  return groups;
}

function sum<Item>(
  items: readonly Item[],
  getValue: (item: Item) => number,
): number {
  return items.reduce((total, item) => total + getValue(item), 0);
}

function formatShortDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
