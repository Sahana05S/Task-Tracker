import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  ALL,
  EMPTY_FILTERS,
  filterTasks,
  hasActiveFilters,
  nextSortState,
  sortTasks,
  type TaskFilterState,
  type TaskSortState,
} from '@/lib/tasks/filters';
import type { Task } from '@/types/tracker';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function makeTask(overrides: Partial<Task> & { id: string; taskTag: string }): Task {
  return {
    id: overrides.id,
    taskTag: overrides.taskTag,
    title: overrides.title ?? 'Test Task',
    category: overrides.category ?? 'T',
    description: overrides.description ?? null,
    comments: overrides.comments ?? null,
    assigneeId: overrides.assigneeId ?? 'user-1',
    reviewerId: overrides.reviewerId ?? null,
    assigneeIds: overrides.assigneeIds ?? [overrides.assigneeId ?? 'user-1'],
    reviewerIds: overrides.reviewerIds ?? [],
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

const TASKS: Task[] = [
  makeTask({ id: 't1', taskTag: 'Sep26_T1', title: 'Alpha task', assigneeId: 'user-1', priority: 'Focus', status: 'In Progress', freshness: 'Fresh', category: 'PJT', taskScale: 20 }),
  makeTask({ id: 't2', taskTag: 'Sep26_T2', title: 'Beta task', assigneeId: 'user-2', priority: 'High', status: 'Not Started', freshness: 'Stale', category: 'T', taskScale: 10 }),
  makeTask({ id: 't3', taskTag: 'Sep26_T3', title: 'Gamma task', assigneeId: 'user-1', priority: 'Low', status: 'Done', freshness: 'Rotten', category: 'OT', taskScale: 5 }),
  makeTask({ id: 't4', taskTag: 'Sep26_T4', title: 'Delta task', assigneeId: 'user-3', priority: 'No', status: 'Discarded', freshness: 'Fresh', category: 'SD', taskScale: null }),
];

/* -------------------------------------------------------------------------- */
/* hasActiveFilters                                                            */
/* -------------------------------------------------------------------------- */

describe('hasActiveFilters', () => {
  it('returns false for EMPTY_FILTERS', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it('returns true when search is non-empty', () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, search: 'alpha' })).toBe(true);
  });

  it('returns true when any facet is set', () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, assigneeId: 'user-1' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, category: 'PJT' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, priority: 'Focus' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, status: 'In Progress' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, freshness: 'Stale' })).toBe(true);
  });

  it('treats whitespace-only search as inactive', () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, search: '   ' })).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* activeFilterCount                                                           */
/* -------------------------------------------------------------------------- */

describe('activeFilterCount', () => {
  it('returns 0 for EMPTY_FILTERS', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
  });

  it('counts each active facet once', () => {
    const filters: TaskFilterState = {
      search: 'alpha',
      assigneeId: 'user-1',
      category: 'PJT',
      priority: ALL,
      status: ALL,
      freshness: ALL,
    };
    expect(activeFilterCount(filters)).toBe(3);
  });

  it('returns 6 when all facets are active', () => {
    const filters: TaskFilterState = {
      search: 'x',
      assigneeId: 'user-1',
      category: 'T',
      priority: 'Focus',
      status: 'In Progress',
      freshness: 'Fresh',
    };
    expect(activeFilterCount(filters)).toBe(6);
  });
});

/* -------------------------------------------------------------------------- */
/* filterTasks                                                                 */
/* -------------------------------------------------------------------------- */

describe('filterTasks', () => {
  it('returns all tasks for EMPTY_FILTERS', () => {
    expect(filterTasks(TASKS, EMPTY_FILTERS)).toHaveLength(TASKS.length);
  });

  it('filters by assigneeId', () => {
    const result = filterTasks(TASKS, { ...EMPTY_FILTERS, assigneeId: 'user-1' });
    expect(result.map((t) => t.id)).toEqual(['t1', 't3']);
  });

  it('filters by any assignee in a multi-assignee task', () => {
    const tasks = [
      ...TASKS,
      makeTask({
        id: 't5',
        taskTag: 'Sep26_T5',
        assigneeId: 'user-1',
        assigneeIds: ['user-1', 'user-4'],
      }),
    ];

    const result = filterTasks(tasks, {
      ...EMPTY_FILTERS,
      assigneeId: 'user-4',
    });

    expect(result.map((task) => task.id)).toEqual(['t5']);
  });

  it('filters by category', () => {
    const result = filterTasks(TASKS, { ...EMPTY_FILTERS, category: 'PJT' });
    expect(result.map((t) => t.id)).toEqual(['t1']);
  });

  it('filters by priority', () => {
    const result = filterTasks(TASKS, { ...EMPTY_FILTERS, priority: 'High' });
    expect(result.map((t) => t.id)).toEqual(['t2']);
  });

  it('filters by status', () => {
    const result = filterTasks(TASKS, { ...EMPTY_FILTERS, status: 'Done' });
    expect(result.map((t) => t.id)).toEqual(['t3']);
  });

  it('filters by freshness', () => {
    const result = filterTasks(TASKS, { ...EMPTY_FILTERS, freshness: 'Rotten' });
    expect(result.map((t) => t.id)).toEqual(['t3']);
  });

  it('combines multiple facets with AND', () => {
    const result = filterTasks(TASKS, {
      ...EMPTY_FILTERS,
      assigneeId: 'user-1',
      freshness: 'Fresh',
    });
    expect(result.map((t) => t.id)).toEqual(['t1']);
  });

  it('filters by title search (case-insensitive)', () => {
    const result = filterTasks(TASKS, { ...EMPTY_FILTERS, search: 'ALPHA' });
    expect(result.map((t) => t.id)).toEqual(['t1']);
  });

  it('filters by taskTag search', () => {
    const result = filterTasks(TASKS, { ...EMPTY_FILTERS, search: 'T3' });
    expect(result.map((t) => t.id)).toEqual(['t3']);
  });

  it('returns empty when nothing matches', () => {
    const result = filterTasks(TASKS, { ...EMPTY_FILTERS, search: 'zzz-no-match' });
    expect(result).toHaveLength(0);
  });

  it('does not mutate the input array', () => {
    const original = [...TASKS];
    filterTasks(TASKS, { ...EMPTY_FILTERS, status: 'Done' });
    expect(TASKS).toEqual(original);
  });
});

/* -------------------------------------------------------------------------- */
/* sortTasks — enum ordering                                                   */
/* -------------------------------------------------------------------------- */

describe('sortTasks — priority ordering', () => {
  const names = new Map<string, string>();
  const sort: TaskSortState = { key: 'priority', direction: 'asc' };

  it('sorts by domain weight, not alphabetically (Focus > High > Medium > Low > No)', () => {
    const result = sortTasks(TASKS, sort, names);
    // asc = ascending weight, so No first, then Low, Medium, High, Focus last
    // But our TASKS have: t1=Focus(4), t2=High(3), t3=Low(1), t4=No(0)
    expect(result.map((t) => t.priority)).toEqual(['No', 'Low', 'High', 'Focus']);
  });

  it('desc reverses the order', () => {
    const result = sortTasks(TASKS, { ...sort, direction: 'desc' }, names);
    expect(result.map((t) => t.priority)).toEqual(['Focus', 'High', 'Low', 'No']);
  });
});

describe('sortTasks — status ordering', () => {
  const names = new Map<string, string>();
  const sort: TaskSortState = { key: 'status', direction: 'asc' };

  it('sorts by pipeline position, not alphabetically', () => {
    const result = sortTasks(TASKS, sort, names);
    // Not Started(0) → In Progress(1) → Done(2) → Discarded(3)
    const statuses = result.map((t) => t.status);
    expect(statuses.indexOf('Not Started')).toBeLessThan(statuses.indexOf('In Progress'));
    expect(statuses.indexOf('In Progress')).toBeLessThan(statuses.indexOf('Done'));
    expect(statuses.indexOf('Done')).toBeLessThan(statuses.indexOf('Discarded'));
  });
});

describe('sortTasks — assignee name ordering', () => {
  it('sorts by display name rather than by UUID', () => {
    const names = new Map([
      ['user-1', 'Zara'],
      ['user-2', 'Alice'],
      ['user-3', 'Mike'],
    ]);
    const result = sortTasks(TASKS, { key: 'assignee', direction: 'asc' }, names);
    const sortedNames = result.map((t) =>
      t.assigneeIds.map((assigneeId) => names.get(assigneeId) ?? '').join(', '),
    );
    expect(sortedNames).toEqual([...sortedNames].sort((a, b) => a.localeCompare(b)));
  });
});

describe('sortTasks — nullable columns sort last', () => {
  const names = new Map<string, string>();

  it('null taskScale goes last in asc direction', () => {
    const tasks = [
      makeTask({ id: 'na', taskTag: 'A', taskScale: null }),
      makeTask({ id: 'nb', taskTag: 'B', taskScale: 5 }),
      makeTask({ id: 'nc', taskTag: 'C', taskScale: 15 }),
    ];
    const result = sortTasks(tasks, { key: 'taskScale', direction: 'asc' }, names);
    expect(result[result.length - 1]?.taskScale).toBeNull();
  });

  it('null taskScale goes last in desc direction', () => {
    const tasks = [
      makeTask({ id: 'na', taskTag: 'A', taskScale: null }),
      makeTask({ id: 'nb', taskTag: 'B', taskScale: 5 }),
      makeTask({ id: 'nc', taskTag: 'C', taskScale: 15 }),
    ];
    const result = sortTasks(tasks, { key: 'taskScale', direction: 'desc' }, names);
    expect(result[result.length - 1]?.taskScale).toBeNull();
  });

  it('null dueDate goes last in both directions', () => {
    const tasksWithDates = [
      makeTask({ id: 'da', taskTag: 'A', dueDate: '2026-10-01' }),
      makeTask({ id: 'db', taskTag: 'B', dueDate: null }),
      makeTask({ id: 'dc', taskTag: 'C', dueDate: '2026-09-01' }),
    ];
    const asc = sortTasks(tasksWithDates, { key: 'dueDate', direction: 'asc' }, names);
    const desc = sortTasks(tasksWithDates, { key: 'dueDate', direction: 'desc' }, names);
    expect(asc[asc.length - 1]?.id).toBe('db');
    expect(desc[desc.length - 1]?.id).toBe('db');
  });
});

describe('sortTasks — purity', () => {
  it('does not mutate the original array', () => {
    const original = [...TASKS];
    sortTasks(TASKS, { key: 'priority', direction: 'asc' }, new Map());
    expect(TASKS).toEqual(original);
  });
});

/* -------------------------------------------------------------------------- */
/* nextSortState                                                               */
/* -------------------------------------------------------------------------- */

describe('nextSortState', () => {
  it('flips direction when the same key is selected again', () => {
    const current: TaskSortState = { key: 'taskTag', direction: 'asc' };
    expect(nextSortState(current, 'taskTag')).toEqual({ key: 'taskTag', direction: 'desc' });
  });

  it('flips desc → asc when the same key is selected', () => {
    const current: TaskSortState = { key: 'taskTag', direction: 'desc' };
    expect(nextSortState(current, 'taskTag')).toEqual({ key: 'taskTag', direction: 'asc' });
  });

  it('resets to asc when a new key is selected', () => {
    const current: TaskSortState = { key: 'taskTag', direction: 'desc' };
    expect(nextSortState(current, 'priority')).toEqual({ key: 'priority', direction: 'asc' });
  });
});
