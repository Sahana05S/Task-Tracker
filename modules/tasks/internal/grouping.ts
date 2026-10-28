import type { Task } from '@/types/tracker';

/** Where a mission sits in the Missions list's sub-mission nesting. */
export interface MissionNesting {
  /** 0 for a top-level row; 1 and deeper for a sub-mission under a shown parent. */
  readonly depth: number;
  /** The parent mission, when this is a sub-mission (shown or not). */
  readonly parentId: string | null;
  readonly parentTag: string | null;
  /** Every sub-mission of this mission, whatever the filters show. */
  readonly childCount: number;
  /** Sub-missions shown right under this row. */
  readonly shownChildren: number;
}

/**
 * Orders the shown missions so each sub-mission follows its parent, keeping the
 * current sort among siblings. A sub-mission whose parent is filtered out stays
 * where the sort put it, at the top level, still naming its parent.
 */
export function nestSubMissions(
  shown: readonly Task[],
  all: readonly Task[],
): { tasks: Task[]; nesting: Map<string, MissionNesting> } {
  const byId = new Map(all.map((task) => [task.id, task] as const));
  const shownIds = new Set(shown.map((task) => task.id));
  const allChildren = new Map<string, number>();
  for (const task of all) {
    if (task.parentTaskId) allChildren.set(task.parentTaskId, (allChildren.get(task.parentTaskId) ?? 0) + 1);
  }
  const shownUnder = new Map<string, Task[]>();
  const roots: Task[] = [];
  for (const task of shown) {
    const parent = task.parentTaskId;
    if (parent && parent !== task.id && shownIds.has(parent)) shownUnder.set(parent, [...(shownUnder.get(parent) ?? []), task]);
    else roots.push(task);
  }

  const tasks: Task[] = [];
  const nesting = new Map<string, MissionNesting>();
  const emit = (task: Task, depth: number) => {
    if (nesting.has(task.id)) return;
    const children = shownUnder.get(task.id) ?? [];
    nesting.set(task.id, {
      depth,
      parentId: task.parentTaskId ?? null,
      parentTag: task.parentTaskId ? byId.get(task.parentTaskId)?.taskTag ?? null : null,
      childCount: allChildren.get(task.id) ?? 0,
      shownChildren: children.length,
    });
    tasks.push(task);
    for (const child of children) emit(child, depth + 1);
  };
  for (const root of roots) emit(root, 0);
  // A parent loop (never written by submission_create) would leave rows unreached.
  for (const task of shown) emit(task, 0);
  return { tasks, nesting };
}

/** Rows left once the collapsed parents hide everything under them. */
export function withoutCollapsed(
  tasks: readonly Task[],
  nesting: ReadonlyMap<string, MissionNesting>,
  collapsed: ReadonlySet<string>,
): Task[] {
  if (collapsed.size === 0) return [...tasks];
  return tasks.filter((task) => {
    let entry = nesting.get(task.id);
    const seen = new Set<string>();
    while (entry && entry.depth > 0 && entry.parentId && !seen.has(entry.parentId)) {
      if (collapsed.has(entry.parentId)) return false;
      seen.add(entry.parentId);
      entry = nesting.get(entry.parentId);
    }
    return true;
  });
}
