import { describe, expect, it } from 'vitest';

import { sortTasks } from '@/modules/tasks/internal/filters';
import { canMarkMissionDone } from '@/modules/tasks/internal/permissions';
import { compareRoadmapMissions, type RoadmapMission } from '@/modules/tasks/internal/roadmap-contract';
import type { Task } from '@/types/tracker';

/* Permanent missions (migration 135): listed first, never Done, timed by the Crew only. */

function task(id: string, taskTag: string, extra: Partial<Task> = {}): Task {
  return {
    id, taskTag, title: taskTag, category: 'T', description: null, comments: null,
    assigneeId: 'crew', reviewerId: null, assigneeIds: ['crew'], reviewerIds: [],
    taskScale: 10, progressPercentage: 0, scaledProgress: 0, taskProductivity: null,
    priority: 'Medium', status: 'In Progress', freshness: 'Fresh', validForMetrics: true,
    assignedDate: '2026-11-01', dueDate: null, completedDate: null, metDeadline: null,
    createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', ...extra,
  };
}
function mission(id: string, dueDate: string | null, isPermanent = false): RoadmapMission {
  return { id, taskTag: id, title: id, priority: 'Medium', status: 'In Progress', dueDate, progress: 0, lifecycleVersion: 1, isPermanent };
}

describe('permanent missions sort first', () => {
  const tasks = [
    task('a', 'Nov26_T1', { dueDate: '2026-11-08', priority: 'Focus' }),
    task('b', 'Nov26_T2', { isPermanent: true }),
    task('c', 'Nov26_T3', { dueDate: '2026-11-07' }),
    task('d', 'Nov26_T4', { isPermanent: true, priority: 'Low' }),
  ];

  it('on the Missions list, whatever the column and direction', () => {
    const names = new Map<string, string>();
    for (const direction of ['asc', 'desc'] as const) {
      for (const key of ['taskTag', 'dueDate', 'priority', 'title'] as const) {
        const order = sortTasks(tasks, { key, direction }, names).map((t) => t.id);
        expect(order.slice(0, 2).sort(), `${key} ${direction}`).toEqual(['b', 'd']);
      }
    }
    // The usual order holds within each group.
    expect(sortTasks(tasks, { key: 'taskTag', direction: 'asc' }, names).map((t) => t.id)).toEqual(['b', 'd', 'a', 'c']);
    expect(sortTasks(tasks, { key: 'taskTag', direction: 'desc' }, names).map((t) => t.id)).toEqual(['d', 'b', 'c', 'a']);
    expect(sortTasks(tasks, { key: 'dueDate', direction: 'asc' }, names).map((t) => t.id).slice(2)).toEqual(['c', 'a']);
  });

  it('on the Today roadmap and graph, before the due-date order', () => {
    const list = [
      mission('00000000-0000-0000-0000-000000000003', '2026-11-07'),
      mission('00000000-0000-0000-0000-000000000004', null, true),
      mission('00000000-0000-0000-0000-000000000001', null),
      mission('00000000-0000-0000-0000-000000000002', null, true),
      mission('00000000-0000-0000-0000-000000000005', '2026-11-06'),
    ];
    expect([...list].sort(compareRoadmapMissions).map((m) => m.id.slice(-1))).toEqual(['2', '4', '5', '3', '1']);
  });
});

describe('permanent mission rules in the interface', () => {
  const md = { id: 'md', role: 'managing_director' as const, isActive: true };
  const crew = { id: 'crew', role: 'team_member' as const, isActive: true };
  const permanent = task('p', 'Nov26_T9', { isPermanent: true });
  const normal = task('n', 'Nov26_T8');

  it('never offers Done on a permanent mission', () => {
    expect(canMarkMissionDone(crew, permanent)).toBe(false);
    expect(canMarkMissionDone(md, permanent)).toBe(false);
    expect(canMarkMissionDone(crew, normal)).toBe(true);
  });

});
