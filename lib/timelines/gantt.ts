import type { AnalyticsPeriod } from '@/lib/analytics/engine';
import type { Task, TaskFreshness, TaskStatus, User } from '@/types/tracker';

export interface TimelineTaskBar {
  readonly taskId: string;
  readonly taskTag: string;
  readonly title: string;
  readonly href: string;
  readonly status: TaskStatus;
  readonly freshness: TaskFreshness;
  readonly startDate: string;
  readonly endDate: string;
  readonly offsetPercent: number;
  readonly widthPercent: number;
  readonly durationDays: number;
}

export interface TimelineAssigneeGroup {
  readonly userId: string;
  readonly name: string;
  readonly employeeId: string | null;
  readonly tasks: readonly TimelineTaskBar[];
}

export interface TimelineTick {
  readonly date: string;
  readonly label: string;
  readonly offsetPercent: number;
}

export interface TaskTimeline {
  readonly startDate: string;
  readonly endDate: string;
  readonly totalDays: number;
  readonly ticks: readonly TimelineTick[];
  readonly groups: readonly TimelineAssigneeGroup[];
}

export function buildTaskTimeline({
  tasks,
  members,
  fallbackPeriod,
}: {
  tasks: readonly Task[];
  members: readonly User[];
  fallbackPeriod: AnalyticsPeriod;
}): TaskTimeline {
  const membersById = new Map(members.map((member) => [member.id, member]));
  const datedTasks = tasks.map((task) => ({
    task,
    startDate: task.assignedDate,
    endDate: normalizeEndDate(task.assignedDate, task.dueDate ?? task.completedDate),
  }));

  const startDate =
    minIsoDate(datedTasks.map((entry) => entry.startDate)) ??
    fallbackPeriod.startDate;
  const endDate =
    maxIsoDate(datedTasks.map((entry) => entry.endDate)) ?? fallbackPeriod.endDate;
  const totalDays = daysInclusive(startDate, endDate);

  const groupsById = new Map<string, TimelineAssigneeGroup>();

  for (const { task, startDate: taskStartDate, endDate: taskEndDate } of datedTasks) {
    for (const assigneeId of assigneeIdsForTask(task)) {
      const member = membersById.get(assigneeId);
      const groupId = member?.id ?? assigneeId;
      const existing = groupsById.get(groupId);
      const bar = buildTimelineTaskBar({
        task,
        startDate: taskStartDate,
        endDate: taskEndDate,
        timelineStartDate: startDate,
        totalDays,
      });

      groupsById.set(groupId, {
        userId: groupId,
        name: member?.fullName ?? 'Unknown assignee',
        employeeId: member?.employeeId ?? null,
        tasks: [...(existing?.tasks ?? []), bar].sort(sortBars),
      });
    }
  }

  return {
    startDate,
    endDate,
    totalDays,
    ticks: buildTimelineTicks(startDate, endDate),
    groups: [...groupsById.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
  };
}

function buildTimelineTaskBar({
  task,
  startDate,
  endDate,
  timelineStartDate,
  totalDays,
}: {
  task: Task;
  startDate: string;
  endDate: string;
  timelineStartDate: string;
  totalDays: number;
}): TimelineTaskBar {
  const durationDays = daysInclusive(startDate, endDate);
  const offsetDays = daysBetween(timelineStartDate, startDate);

  return {
    taskId: task.id,
    taskTag: task.taskTag,
    title: task.title,
    href: `/tasks/${encodeURIComponent(task.taskTag)}`,
    status: task.status,
    freshness: task.freshness,
    startDate,
    endDate,
    offsetPercent: roundPercent((offsetDays / totalDays) * 100),
    widthPercent: roundPercent((durationDays / totalDays) * 100),
    durationDays,
  };
}

function buildTimelineTicks(startDate: string, endDate: string): TimelineTick[] {
  const totalDays = daysInclusive(startDate, endDate);
  const interval = totalDays <= 35 ? 1 : totalDays <= 120 ? 7 : 30;
  const ticks: TimelineTick[] = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    ticks.push({
      date,
      label: formatTickLabel(date, interval),
      offsetPercent: roundPercent((daysBetween(startDate, date) / totalDays) * 100),
    });
    cursor.setUTCDate(cursor.getUTCDate() + interval);
  }

  if (ticks.at(-1)?.date !== endDate) {
    ticks.push({
      date: endDate,
      label: formatTickLabel(endDate, interval),
      offsetPercent: roundPercent(((totalDays - 1) / totalDays) * 100),
    });
  }

  return ticks;
}

function normalizeEndDate(startDate: string, candidate: string | null): string {
  if (candidate === null || candidate < startDate) return startDate;
  return candidate;
}

function assigneeIdsForTask(task: Task): string[] {
  const ids = task.assigneeIds.length > 0 ? task.assigneeIds : [task.assigneeId];
  return [...new Set(ids)];
}

function minIsoDate(dates: readonly string[]): string | null {
  if (dates.length === 0) return null;
  return dates.reduce((earliest, date) => (date < earliest ? date : earliest));
}

function maxIsoDate(dates: readonly string[]): string | null {
  if (dates.length === 0) return null;
  return dates.reduce((latest, date) => (date > latest ? date : latest));
}

function daysInclusive(startDate: string, endDate: string): number {
  return Math.max(1, daysBetween(startDate, endDate) + 1);
}

function daysBetween(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

function formatTickLabel(date: string, interval: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;

  return parsed.toLocaleDateString('en-US', {
    month: interval >= 30 ? 'short' : undefined,
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function sortBars(left: TimelineTaskBar, right: TimelineTaskBar): number {
  return (
    left.startDate.localeCompare(right.startDate) ||
    left.endDate.localeCompare(right.endDate) ||
    left.taskTag.localeCompare(right.taskTag)
  );
}

function roundPercent(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}
