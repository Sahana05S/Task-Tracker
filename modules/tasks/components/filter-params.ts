import { ALL, EMPTY_FILTERS, type TaskFilterState } from '@/modules/tasks/internal/filters';
import { TASK_CATEGORIES, TASK_FRESHNESS_STATES, TASK_PRIORITIES, TASK_STATUSES } from '@/shared/tracker/enums';

/**
 * Missions filters in the URL, beside `view`, so a refresh, a shared link or
 * the back button keeps them. Unknown values fall back to "all".
 */

export type MissionView = 'cards' | 'table';

interface ParamReader {
  get(name: string): string | null;
}

function oneOf<T extends string>(values: readonly T[], value: string | null): T | typeof ALL {
  return value !== null && (values as readonly string[]).includes(value) ? (value as T) : ALL;
}

export function viewFromParams(params: ParamReader): MissionView {
  return params.get('view') === 'table' ? 'table' : 'cards';
}

export function filtersFromParams(params: ParamReader): TaskFilterState {
  return {
    search: params.get('q') ?? '',
    assigneeId: params.get('assignee') || ALL,
    category: oneOf(TASK_CATEGORIES, params.get('type')),
    priority: oneOf(TASK_PRIORITIES, params.get('priority')),
    status: oneOf(TASK_STATUSES, params.get('status')),
    freshness: oneOf(TASK_FRESHNESS_STATES, params.get('fresh')),
  };
}

/** `/tasks` with the view and every narrowed filter, in a stable order. */
export function missionsHref(view: MissionView, filters: TaskFilterState = EMPTY_FILTERS): string {
  const params = new URLSearchParams();
  if (view === 'table') params.set('view', 'table');
  if (filters.search !== '') params.set('q', filters.search);
  if (filters.assigneeId !== ALL) params.set('assignee', filters.assigneeId);
  if (filters.category !== ALL) params.set('type', filters.category);
  if (filters.priority !== ALL) params.set('priority', filters.priority);
  if (filters.status !== ALL) params.set('status', filters.status);
  if (filters.freshness !== ALL) params.set('fresh', filters.freshness);
  const query = params.toString();
  return query ? `/tasks?${query}` : '/tasks';
}
