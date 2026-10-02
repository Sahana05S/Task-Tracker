import {
  isTaskCarriedInPeriod,
  median,
  type AnalyticsPeriod,
  type TeamAnalytics,
} from '@/lib/analytics/engine';
import {
  CATEGORY_LABELS,
  PRIORITY_WEIGHTS,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@/lib/tracker/enums';
import type { Task, TaskCategory, TaskPriority, TaskStatus, User } from '@/types/tracker';

export interface DashboardBucket {
  key: string;
  label: string;
  value: number;
}

export interface DashboardMemberMetric {
  userId: string;
  label: string;
  value: number;
  taskCount?: number;
}

export interface PerformanceWithMedianMetric extends DashboardMemberMetric {
  median: number | null;
}

export interface DateBucket {
  date: string;
  label: string;
  value: number;
}

export interface DeadlineOutcomeBucket extends DashboardBucket {
  key: 'met' | 'missed' | 'open';
}

export interface WorkbookDashboardCharts {
  performanceWithMedian: {
    median: number | null;
    members: PerformanceWithMedianMetric[];
  };
  taskPriorities: DashboardBucket[];
  taskStatuses: DashboardBucket[];
  taskAssignees: DashboardMemberMetric[];
  taskTypes: DashboardBucket[];
  tasksDoneByDate: DateBucket[];
  deadlineOutcomes: DeadlineOutcomeBucket[];
  priorityLoadingOnTeam: DashboardMemberMetric[];
  totalProgressByTeam: DashboardMemberMetric[];
  summary: {
    trackedTaskCount: number;
    completedTaskCount: number;
    overdueOpenTaskCount: number;
  };
}

export interface WorkbookDashboardInput {
  analytics: TeamAnalytics;
  members: readonly User[];
  tasks: readonly Task[];
  period: AnalyticsPeriod;
}

export function buildWorkbookDashboardCharts({
  analytics,
  members,
  tasks,
  period,
}: WorkbookDashboardInput): WorkbookDashboardCharts {
  const activeMembers = members.filter((member) => member.isActive);
  const memberNames = new Map(
    activeMembers.map((member) => [member.id, member.fullName]),
  );

  const trackedTasks = tasks.filter((task) => isTaskCarriedInPeriod(task, period));
  const completedTasks = trackedTasks.filter(
    (task) => task.status === 'Done' && task.completedDate !== null,
  );

  const starScores = analytics.members.map((member) => member.starScore);
  const performanceMedian = median(starScores);

  const assigneeCounts = new Map<string, number>();
  const priorityLoad = new Map<string, number>();
  const progressByMember = new Map<string, number>();
  const progressTaskCounts = new Map<string, number>();

  for (const member of activeMembers) {
    assigneeCounts.set(member.id, 0);
    priorityLoad.set(member.id, 0);
    progressByMember.set(member.id, 0);
    progressTaskCounts.set(member.id, 0);
  }

  for (const task of trackedTasks) {
    const assigneeIds = assigneeIdsForTask(task).filter((id) =>
      memberNames.has(id),
    );

    for (const assigneeId of assigneeIds) {
      assigneeCounts.set(assigneeId, (assigneeCounts.get(assigneeId) ?? 0) + 1);
      priorityLoad.set(
        assigneeId,
        (priorityLoad.get(assigneeId) ?? 0) + PRIORITY_WEIGHTS[task.priority],
      );
      progressByMember.set(
        assigneeId,
        (progressByMember.get(assigneeId) ?? 0) + taskProgressValue(task),
      );
      progressTaskCounts.set(
        assigneeId,
        (progressTaskCounts.get(assigneeId) ?? 0) + 1,
      );
    }
  }

  const tasksDoneByDate = buildTasksDoneByDate(completedTasks, period);
  const deadlineOutcomes = buildDeadlineOutcomes(trackedTasks, period);

  return {
    performanceWithMedian: {
      median: performanceMedian,
      members: analytics.members.map((member) => ({
        userId: member.userId,
        label: member.fullName,
        value: member.starScore,
        median: performanceMedian,
        taskCount: member.taskCount,
      })),
    },
    taskPriorities: TASK_PRIORITIES.map((priority) => ({
      key: priority,
      label: priority,
      value: countBy(trackedTasks, 'priority', priority),
    })),
    taskStatuses: TASK_STATUSES.map((status) => ({
      key: status,
      label: status,
      value: countBy(trackedTasks, 'status', status),
    })),
    taskAssignees: memberMetricsFromMap(assigneeCounts, memberNames),
    taskTypes: TASK_CATEGORIES.map((category) => ({
      key: category,
      label: CATEGORY_LABELS[category],
      value: countBy(trackedTasks, 'category', category),
    })),
    tasksDoneByDate,
    deadlineOutcomes,
    priorityLoadingOnTeam: memberMetricsFromMap(priorityLoad, memberNames),
    totalProgressByTeam: memberMetricsFromMap(progressByMember, memberNames).map(
      (metric) => ({
        ...metric,
        taskCount: progressTaskCounts.get(metric.userId) ?? 0,
      }),
    ),
    summary: {
      trackedTaskCount: trackedTasks.length,
      completedTaskCount: completedTasks.length,
      overdueOpenTaskCount:
        deadlineOutcomes.find((bucket) => bucket.key === 'open')?.value ?? 0,
    },
  };
}

function assigneeIdsForTask(task: Task): string[] {
  return [...new Set(task.assigneeIds.length > 0 ? task.assigneeIds : [task.assigneeId])];
}

function taskProgressValue(task: Task): number {
  if (task.scaledProgress !== null) return task.scaledProgress;
  if (task.taskScale === null || task.progressPercentage === null) return 0;
  return task.taskScale * (task.progressPercentage / 100);
}

function countBy<Key extends keyof Task>(
  tasks: readonly Task[],
  key: Key,
  value: Task[Key],
): number {
  return tasks.reduce((count, task) => count + (task[key] === value ? 1 : 0), 0);
}

function memberMetricsFromMap(
  values: ReadonlyMap<string, number>,
  memberNames: ReadonlyMap<string, string>,
): DashboardMemberMetric[] {
  return [...memberNames.entries()]
    .map(([userId, label]) => ({
      userId,
      label,
      value: roundChartValue(values.get(userId) ?? 0),
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function buildTasksDoneByDate(
  completedTasks: readonly Task[],
  period: AnalyticsPeriod,
): DateBucket[] {
  const counts = new Map<string, number>();

  for (const task of completedTasks) {
    if (
      task.completedDate === null ||
      task.completedDate < period.startDate ||
      task.completedDate > period.endDate
    ) {
      continue;
    }
    counts.set(task.completedDate, (counts.get(task.completedDate) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, value]) => ({
      date,
      label: formatShortDate(date),
      value,
    }));
}

function buildDeadlineOutcomes(
  tasks: readonly Task[],
  period: AnalyticsPeriod,
): DeadlineOutcomeBucket[] {
  let met = 0;
  let missed = 0;
  let open = 0;

  for (const task of tasks) {
    if (task.status === 'Done') {
      if (task.metDeadline === true) met++;
      if (task.metDeadline === false) missed++;
      continue;
    }

    if (
      task.status !== 'Discarded' &&
      task.dueDate !== null &&
      task.dueDate < period.endDate
    ) {
      open++;
    }
  }

  return [
    { key: 'met', label: 'Met deadline', value: met },
    { key: 'missed', label: 'Missed deadline', value: missed },
    { key: 'open', label: 'Open overdue', value: open },
  ];
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

function roundChartValue(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
