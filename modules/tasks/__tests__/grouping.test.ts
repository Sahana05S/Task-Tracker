import { describe, expect, it } from 'vitest';
import { attachSubMissionParents } from '@/modules/tasks/internal/mappers';
import { nestSubMissions, withoutCollapsed } from '@/modules/tasks/internal/grouping';
import type { Task } from '@/types/tracker';

function task(id: string, parentTaskId: string | null = null): Task {
  return {
    id, parentTaskId, taskTag: id.toUpperCase(), title: id, category: 'T', description: null, comments: null,
    assigneeId: 'u1', reviewerId: null, assigneeIds: ['u1'], reviewerIds: [], taskScale: 10, progressPercentage: 0,
    scaledProgress: 0, taskProductivity: null, priority: 'Medium', status: 'Not Started', freshness: 'Fresh',
    validForMetrics: false, assignedDate: '2026-10-01', dueDate: null, completedDate: null, metDeadline: null,
    createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  };
}
const ids = (tasks: readonly Task[]) => tasks.map((t) => t.id);

describe('sub-missions on the Missions list', () => {
  it('reads the parent from Subtask links', () => {
    const [a, b] = attachSubMissionParents([task('a'), task('b')], [{ predecessor_task_id: 'a', successor_task_id: 'b' }]);
    expect(a.parentTaskId).toBeNull();
    expect(b.parentTaskId).toBe('a');
  });

  it('puts each sub-mission right after its parent, keeping the sort among siblings', () => {
    const all = [task('c2', 'p'), task('x'), task('p'), task('c1', 'p'), task('g', 'c1')];
    const { tasks, nesting } = nestSubMissions(all, all);
    expect(ids(tasks)).toEqual(['x', 'p', 'c2', 'c1', 'g']);
    expect(nesting.get('p')).toMatchObject({ depth: 0, childCount: 2, shownChildren: 2, parentTag: null });
    expect(nesting.get('c1')).toMatchObject({ depth: 1, parentId: 'p', parentTag: 'P', childCount: 1 });
    expect(nesting.get('g')).toMatchObject({ depth: 2, parentTag: 'C1' });
  });

  it('keeps a sub-mission whose parent is filtered out at the top level, still naming the parent', () => {
    const all = [task('p'), task('c', 'p'), task('y')];
    const { tasks, nesting } = nestSubMissions([all[2], all[1]], all);
    expect(ids(tasks)).toEqual(['y', 'c']);
    expect(nesting.get('c')).toMatchObject({ depth: 0, parentId: 'p', parentTag: 'P' });
  });

  it('counts every sub-mission but shows only the filtered ones', () => {
    const all = [task('p'), task('c1', 'p'), task('c2', 'p')];
    const { nesting } = nestSubMissions([all[0], all[1]], all);
    expect(nesting.get('p')).toMatchObject({ childCount: 2, shownChildren: 1 });
  });

  it('hides everything under a collapsed parent', () => {
    const all = [task('p'), task('c', 'p'), task('g', 'c'), task('z')];
    const { tasks, nesting } = nestSubMissions(all, all);
    expect(ids(withoutCollapsed(tasks, nesting, new Set(['p'])))).toEqual(['p', 'z']);
    expect(ids(withoutCollapsed(tasks, nesting, new Set(['c'])))).toEqual(['p', 'c', 'z']);
  });

  it('never drops a row caught in a parent loop', () => {
    const all = [task('a', 'b'), task('b', 'a')];
    expect(ids(nestSubMissions(all, all).tasks).sort()).toEqual(['a', 'b']);
  });
});
