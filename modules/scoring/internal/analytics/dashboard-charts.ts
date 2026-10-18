import { eligibilityReasons } from '@/modules/tasks/client';
import {
  isTaskCarriedInPeriod,
  median,
  type AnalyticsPeriod,
  type TeamAnalytics,
} from '@/modules/scoring/internal/analytics/engine';
import {
  CATEGORY_LABELS,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@/shared/tracker/enums';
import { PRIORITY_WEIGHTS } from '@/modules/tasks/client';
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
  priorityLoadingUnavailableReason?: string;
  performanceUnavailableReason?: string;
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
  /** Asia/Kolkata as-of date; overdue means due before it, not merely before month end. */
  asOfDate?: string;
}

export function buildWorkbookDashboardCharts({
  analytics,
  members,
  tasks,
  period,
  asOfDate,
}: WorkbookDashboardInput): WorkbookDashboardCharts {
  const activeMembers = members.filter((member) => member.isActive);
  const memberNames = new Map(
    activeMembers.map((member) => [member.id, member.fullName]),
  );

  const trackedTasks = tasks.filter((task) => isTaskCarriedInPeriod(task, period));
  const completedTasks = trackedTasks.filter(
    (task) => task.status === 'Done' && task.completedDate !== null,
  );

  const performanceIncomplete=analytics.calculation?.status==='incomplete'||analytics.members.some(member=>member.starScore===null);
  const starScores = analytics.members.map((member) => member.starScore).filter((score):score is number=>score!==null);
  const sharedPriority=trackedTasks.some(task=>task.assigneeIds.length>1 || Object.keys(task.participantShares ?? {}).length>1);
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
        (priorityLoad.get(assigneeId) ?? 0) + (eligibilityReasons(task).length===0 ? PRIORITY_WEIGHTS[task.priority] : 0),
      );
      progressTaskCounts.set(
        assigneeId,
        (progressTaskCounts.get(assigneeId) ?? 0) + 1,
      );
    }
  }

  for (const task of trackedTasks) {
    const credits=task.earnedProgressCredits ?? Object.fromEntries(assigneeIdsForTask(task).map(id=>[id,
      taskProgressValue(task)*(task.participantCreditMode==='configured' ? (task.participantShares?.[id]??0)/1_000_000 : 1)]));
    for (const [id,credit] of Object.entries(credits)) {
      if (memberNames.has(id)) progressByMember.set(id,(progressByMember.get(id)??0)+credit);
    }
  }

  const tasksDoneByDate = buildTasksDoneByDate(completedTasks, period);
  const deadlineOutcomes = buildDeadlineOutcomes(trackedTasks, period, asOfDate);

  return {
    performanceWithMedian: {
      median: performanceIncomplete ? null : performanceMedian,
      members: (performanceIncomplete ? [] : analytics.members.filter(member=>member.starScore!==null)).map((member) => ({
        userId: member.userId,
        label: member.fullName,
        value: member.starScore!,
        median: performanceIncomplete ? null : performanceMedian,
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
    priorityLoadingOnTeam: analytics.calculation ? analytics.members.filter(member=>member.criticalityScore!==null).map(member=>({userId:member.userId,label:member.fullName,value:member.criticalityScore!})) : sharedPriority ? [] : memberMetricsFromMap(priorityLoad, memberNames),
    performanceUnavailableReason: performanceIncomplete ? "Ten-factor performance is incomplete; final ranking is unavailable. See factor inputs and reasons." : undefined,
    priorityLoadingUnavailableReason: analytics.calculation ? (analytics.members.some(member=>member.criticalityScore===null)?"Criticality inputs are unavailable for some members.":undefined) : sharedPriority ? "Priority attribution requires the shared performance context." : undefined,
    totalProgressByTeam: analytics.calculation ? analytics.members.filter(member=>member.scaledProgress!==null).map(member=>({userId:member.userId,label:member.fullName,value:member.scaledProgress!,taskCount:member.taskCount})) : memberMetricsFromMap(progressByMember, memberNames).map(
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
  asOfDate?: string,
): DeadlineOutcomeBucket[] {
  // A live month is evaluated at its as-of date: work due later this month is
  // not yet overdue. Past months keep the period-end boundary.
  const overdueBefore = asOfDate && asOfDate < period.endDate ? asOfDate : period.endDate;
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
      task.dueDate < overdueBefore &&
      // Archived (e.g. handed off by carryover) work is no longer open.
      !(task.archivedEffectiveDate && task.archivedEffectiveDate <= (asOfDate ?? period.endDate))
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
