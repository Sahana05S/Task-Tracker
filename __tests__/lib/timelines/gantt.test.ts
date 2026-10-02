import { describe, expect, it } from 'vitest';

import { resolvePeriod } from '@/lib/analytics/engine';
import { buildTaskTimeline } from '@/lib/timelines/gantt';
import type { Task, User } from '@/types/tracker';

const SEP_2026 = resolvePeriod(2026, 9);

function makeUser(overrides: Partial<User> & { id: string; fullName: string }): User {
  return {
    id: overrides.id,
    employeeId: overrides.employeeId ?? `EMP-${overrides.id}`,
    fullName: overrides.fullName,
    email: overrides.email ?? `${overrides.id}@test.com`,
    role: overrides.role ?? 'team_member',
    isActive: overrides.isActive ?? true,
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00Z',
  };
}

function makeTask(
  overrides: Partial<Task> & { id: string; taskTag: string; assigneeId: string },
): Task {
  return {
    id: overrides.id,
    taskTag: overrides.taskTag,
    title: overrides.title ?? 'Test task',
    category: overrides.category ?? 'T',
    description: overrides.description ?? null,
    comments: overrides.comments ?? null,
    assigneeId: overrides.assigneeId,
    reviewerId: overrides.reviewerId ?? null,
    assigneeIds: overrides.assigneeIds ?? [overrides.assigneeId],
    reviewerIds: overrides.reviewerIds ?? [],
    taskScale: overrides.taskScale ?? 100,
    progressPercentage: overrides.progressPercentage ?? 0,
    scaledProgress: overrides.scaledProgress ?? 0,
    taskProductivity: overrides.taskProductivity ?? null,
    priority: overrides.priority ?? 'Medium',
    status: overrides.status ?? 'In Progress',
    freshness: overrides.freshness ?? 'Fresh',
    validForMetrics: overrides.validForMetrics ?? true,
    assignedDate: overrides.assignedDate ?? '2026-09-01',
    dueDate: overrides.dueDate ?? '2026-09-05',
    completedDate: overrides.completedDate ?? null,
    metDeadline: overrides.metDeadline ?? null,
    createdAt: overrides.createdAt ?? '2026-09-01T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-09-01T00:00:00Z',
  };
}

describe('buildTaskTimeline', () => {
  it('groups task bars by every assignee and calculates offsets and widths', () => {
    const timeline = buildTaskTimeline({
      fallbackPeriod: SEP_2026,
      members: [
        makeUser({ id: 'alice', fullName: 'Alice Admin' }),
        makeUser({ id: 'bob', fullName: 'Bob Builder' }),
      ],
      tasks: [
        makeTask({
          id: 'task-1',
          taskTag: 'Sep26_T1',
          title: 'Shared task',
          assigneeId: 'alice',
          assigneeIds: ['alice', 'bob'],
          assignedDate: '2026-09-01',
          dueDate: '2026-09-05',
          status: 'In Progress',
          freshness: 'Stale',
        }),
        makeTask({
          id: 'task-2',
          taskTag: 'Sep26_T2',
          assigneeId: 'bob',
          assignedDate: '2026-09-03',
          dueDate: '2026-09-10',
          status: 'Done',
          freshness: 'Fresh',
        }),
      ],
    });

    expect(timeline.startDate).toBe('2026-09-01');
    expect(timeline.endDate).toBe('2026-09-10');
    expect(timeline.totalDays).toBe(10);
    expect(timeline.groups).toHaveLength(2);

    const aliceTask = timeline.groups
      .find((group) => group.userId === 'alice')
      ?.tasks.find((task) => task.taskTag === 'Sep26_T1');
    expect(aliceTask).toMatchObject({
      href: '/tasks/Sep26_T1',
      startDate: '2026-09-01',
      endDate: '2026-09-05',
      offsetPercent: 0,
      widthPercent: 50,
      durationDays: 5,
      status: 'In Progress',
      freshness: 'Stale',
    });

    const bobTasks = timeline.groups.find((group) => group.userId === 'bob')?.tasks;
    expect(bobTasks?.map((task) => task.taskTag)).toEqual([
      'Sep26_T1',
      'Sep26_T2',
    ]);
    expect(bobTasks?.[1]).toMatchObject({
      offsetPercent: 20,
      widthPercent: 80,
      durationDays: 8,
    });
  });

  it('falls back to one-day bars and the current period when no tasks exist', () => {
    const timeline = buildTaskTimeline({
      fallbackPeriod: SEP_2026,
      members: [],
      tasks: [],
    });

    expect(timeline.startDate).toBe('2026-09-01');
    expect(timeline.endDate).toBe('2026-09-30');
    expect(timeline.totalDays).toBe(30);
    expect(timeline.groups).toEqual([]);
    expect(timeline.ticks[0]).toMatchObject({
      date: '2026-09-01',
      offsetPercent: 0,
    });
    expect(timeline.ticks.at(-1)?.date).toBe('2026-09-30');
  });

  it('normalizes missing or backwards due dates to the assigned date', () => {
    const timeline = buildTaskTimeline({
      fallbackPeriod: SEP_2026,
      members: [makeUser({ id: 'alice', fullName: 'Alice Admin' })],
      tasks: [
        makeTask({
          id: 'task-1',
          taskTag: 'Sep26_T1',
          assigneeId: 'alice',
          assignedDate: '2026-09-15',
          dueDate: null,
        }),
        makeTask({
          id: 'task-2',
          taskTag: 'Sep26_T2',
          assigneeId: 'alice',
          assignedDate: '2026-09-20',
          dueDate: '2026-09-10',
        }),
      ],
    });

    expect(timeline.endDate).toBe('2026-09-20');
    expect(
      timeline.groups[0]?.tasks.map((task) => ({
        tag: task.taskTag,
        start: task.startDate,
        end: task.endDate,
        duration: task.durationDays,
      })),
    ).toEqual([
      { tag: 'Sep26_T1', start: '2026-09-15', end: '2026-09-15', duration: 1 },
      { tag: 'Sep26_T2', start: '2026-09-20', end: '2026-09-20', duration: 1 },
    ]);
  });
});
