import type { TaskEffort } from '@/lib/logs/metrics';
import {
  FRESHNESS_ORDER,
  PRIORITY_WEIGHTS,
  STATUS_ORDER,
} from '@/lib/tracker/enums';
import type {
  Task,
  TaskCategory,
  TaskFreshness,
  TaskPriority,
  TaskStatus,
} from '@/types/tracker';

/**
 * Pure filtering and sorting for the task views.
 *
 * Deliberately free of React and of Supabase so the grid, the card list and the
 * tests all share one implementation. Filtering happens in the browser against
 * an already-fetched set: the team-scale row count is small, and keystroke-rate
 * search against a server round trip would feel worse. Move this into SQL once
 * the table outgrows a single fetch.
 */

/** Sentinel for "no constraint on this facet". */
export const ALL = 'all' as const;
export type All = typeof ALL;

export interface TaskFilterState {
  /** Free text, matched against title and task tag. */
  search: string;
  assigneeId: string | All;
  category: TaskCategory | All;
  priority: TaskPriority | All;
  status: TaskStatus | All;
  freshness: TaskFreshness | All;
}

export const EMPTY_FILTERS: TaskFilterState = {
  search: '',
  assigneeId: ALL,
  category: ALL,
  priority: ALL,
  status: ALL,
  freshness: ALL,
};

/** True when any facet is narrowing the result set. */
export function hasActiveFilters(filters: TaskFilterState): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.assigneeId !== ALL ||
    filters.category !== ALL ||
    filters.priority !== ALL ||
    filters.status !== ALL ||
    filters.freshness !== ALL
  );
}

/** Number of narrowed facets, for the "clear filters" badge count. */
export function activeFilterCount(filters: TaskFilterState): number {
  let count = 0;
  if (filters.search.trim() !== '') count++;
  if (filters.assigneeId !== ALL) count++;
  if (filters.category !== ALL) count++;
  if (filters.priority !== ALL) count++;
  if (filters.status !== ALL) count++;
  if (filters.freshness !== ALL) count++;
  return count;
}

export function filterTasks(
  tasks: readonly Task[],
  filters: TaskFilterState,
): Task[] {
  const needle = filters.search.trim().toLowerCase();

  return tasks.filter((task) => {
    if (
      filters.assigneeId !== ALL &&
      !task.assigneeIds.includes(filters.assigneeId)
    ) {
      return false;
    }
    if (filters.category !== ALL && task.category !== filters.category) {
      return false;
    }
    if (filters.priority !== ALL && task.priority !== filters.priority) {
      return false;
    }
    if (filters.status !== ALL && task.status !== filters.status) {
      return false;
    }
    if (filters.freshness !== ALL && task.freshness !== filters.freshness) {
      return false;
    }

    if (needle !== '') {
      const matches =
        task.title.toLowerCase().includes(needle) ||
        task.taskTag.toLowerCase().includes(needle);
      if (!matches) return false;
    }

    return true;
  });
}

/* -------------------------------------------------------------------------- */
/* Sorting                                                                    */
/* -------------------------------------------------------------------------- */

export type TaskSortKey =
  | 'taskTag'
  | 'title'
  | 'category'
  | 'assignee'
  | 'priority'
  | 'status'
  | 'freshness'
  | 'taskScale'
  | 'progressPercentage'
  | 'scaledProgress'
  | 'hoursLogged'
  | 'taskProductivity'
  | 'dueDate';

export type SortDirection = 'asc' | 'desc';

export interface TaskSortState {
  key: TaskSortKey;
  direction: SortDirection;
}

export const DEFAULT_SORT: TaskSortState = {
  key: 'taskTag',
  direction: 'asc',
};

/**
 * Nulls sort last in both directions.
 *
 * Returning a fixed value regardless of direction is intentional: a task with no
 * due date is not "earlier" than one due tomorrow, it is unscheduled, and
 * flipping the column should not parade unscheduled rows to the top.
 */
function compareNullableNumbers(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function compareNullableStrings(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

/**
 * Sorts tasks, resolving the `assignee` column through a name lookup so the
 * grid orders by display name rather than by opaque UUID.
 *
 * Enum columns sort by their domain order — priority by the weights in
 * `domain-rules.md`, status by pipeline position, freshness by decay — not
 * alphabetically, which would interleave Focus between Low and High.
 *
 * `effortByTask` supplies logged hours, which have no column on `tasks` and are
 * aggregated from `daily_task_logs`. A task with no logs counts as zero hours
 * rather than null: nobody has worked on it, which is a real quantity, not a
 * missing measurement.
 */
export function sortTasks(
  tasks: readonly Task[],
  sort: TaskSortState,
  assigneeNames: ReadonlyMap<string, string>,
  effortByTask: ReadonlyMap<string, TaskEffort> = new Map(),
): Task[] {
  const factor = sort.direction === 'asc' ? 1 : -1;
  const hoursFor = (task: Task): number =>
    effortByTask.get(task.id)?.hoursLogged ?? 0;
  const assigneeLabelFor = (task: Task): string =>
    task.assigneeIds
      .map((assigneeId) => assigneeNames.get(assigneeId) ?? '')
      .filter(Boolean)
      .join(', ');

  const compare = (a: Task, b: Task): number => {
    switch (sort.key) {
      case 'taskTag':
        return a.taskTag.localeCompare(b.taskTag);
      case 'title':
        return a.title.localeCompare(b.title);
      case 'category':
        return a.category.localeCompare(b.category);
      case 'assignee':
        return assigneeLabelFor(a).localeCompare(assigneeLabelFor(b));
      case 'priority':
        return PRIORITY_WEIGHTS[a.priority] - PRIORITY_WEIGHTS[b.priority];
      case 'status':
        return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      case 'freshness':
        return FRESHNESS_ORDER[a.freshness] - FRESHNESS_ORDER[b.freshness];
      case 'taskScale':
        return compareNullableNumbers(a.taskScale, b.taskScale);
      case 'progressPercentage':
        return compareNullableNumbers(
          a.progressPercentage,
          b.progressPercentage,
        );
      case 'scaledProgress':
        return compareNullableNumbers(a.scaledProgress, b.scaledProgress);
      case 'hoursLogged':
        return hoursFor(a) - hoursFor(b);
      case 'taskProductivity':
        return compareNullableNumbers(a.taskProductivity, b.taskProductivity);
      case 'dueDate':
        return compareNullableStrings(a.dueDate, b.dueDate);
    }
  };

  return [...tasks].sort((a, b) => {
    const primary = compare(a, b);
    // Null placement must not invert when the column is reversed.
    if (primary !== 0) {
      const aNull = isNullForKey(a, sort.key);
      const bNull = isNullForKey(b, sort.key);
      if (aNull !== bNull) return primary;
      return primary * factor;
    }
    // Tag is unique, so this makes the whole sort deterministic.
    return a.taskTag.localeCompare(b.taskTag) * factor;
  });
}

function isNullForKey(task: Task, key: TaskSortKey): boolean {
  switch (key) {
    case 'taskScale':
      return task.taskScale === null;
    case 'progressPercentage':
      return task.progressPercentage === null;
    case 'scaledProgress':
      return task.scaledProgress === null;
    case 'taskProductivity':
      return task.taskProductivity === null;
    case 'dueDate':
      return task.dueDate === null;
    default:
      return false;
  }
}

/** Toggles direction when re-selecting the active column. */
export function nextSortState(
  current: TaskSortState,
  key: TaskSortKey,
): TaskSortState {
  if (current.key === key) {
    return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { key, direction: 'asc' };
}
