import { describe, expect, it, vi } from 'vitest';

import {
  normalizeTaskTagParam,
  resolveTaskDetailRouteState,
  type TaskDetailData,
} from '@/lib/tasks/detail';
import { EMPTY_EFFORT } from '@/lib/logs/metrics';

describe('task detail route helpers', () => {
  it('normalizes plain and encoded task tags', () => {
    expect(normalizeTaskTagParam('Sep26_T5')).toBe('Sep26_T5');
    expect(normalizeTaskTagParam('Sep26%20OT1')).toBe('Sep26 OT1');
    expect(normalizeTaskTagParam('  Sep26_T5  ')).toBe('Sep26_T5');
  });

  it('rejects empty, malformed, and too-long task tags', () => {
    expect(normalizeTaskTagParam('')).toBeNull();
    expect(normalizeTaskTagParam('%')).toBeNull();
    expect(normalizeTaskTagParam('A'.repeat(31))).toBeNull();
  });

  it('does not load data for invalid task tags', async () => {
    const loadData =
      vi.fn<(taskTag: string) => Promise<TaskDetailData | null>>();

    await expect(resolveTaskDetailRouteState('%', loadData)).resolves.toEqual({
      status: 'invalid',
    });
    expect(loadData).not.toHaveBeenCalled();
  });

  it('returns missing route state when a valid task tag has no task', async () => {
    const loadData = vi.fn<
      (taskTag: string) => Promise<TaskDetailData | null>
    >(
      async () => null,
    );

    await expect(
      resolveTaskDetailRouteState('Sep26_MISSING', loadData),
    ).resolves.toEqual({
      status: 'missing',
      taskTag: 'Sep26_MISSING',
    });
    expect(loadData).toHaveBeenCalledWith('Sep26_MISSING');
  });

  it('returns ready route state for a valid existing task', async () => {
    const detailData = createTaskDetailData('Sep26_T5');
    const loadData = vi.fn<
      (taskTag: string) => Promise<TaskDetailData | null>
    >(
      async () => detailData,
    );

    await expect(
      resolveTaskDetailRouteState('Sep26_T5', loadData),
    ).resolves.toEqual({
      status: 'ready',
      data: detailData,
    });
    expect(loadData).toHaveBeenCalledWith('Sep26_T5');
  });
});

function createTaskDetailData(taskTag: string): TaskDetailData {
  return {
    task: {
      id: 'task-id',
      taskTag,
      title: 'Non-Documented Tasks',
      category: 'T',
      description: null,
      comments: null,
      assigneeId: 'user-id',
      reviewerId: null,
      assigneeIds: ['user-id'],
      reviewerIds: [],
      taskScale: 100,
      progressPercentage: 50,
      scaledProgress: 50,
      taskProductivity: 5,
      priority: 'Medium',
      status: 'In Progress',
      freshness: 'Fresh',
      validForMetrics: true,
      assignedDate: '2026-09-01',
      dueDate: '2026-09-30',
      completedDate: null,
      metDeadline: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
    members: [],
    sections: [],
    links: [],
    dependencies: [],
    logs: [],
    timers: [],
    checklist: null,
    checklistNodes: [],
    linkedTasksById: new Map(),
    checklistProgressPercentage: 0,
    effort: EMPTY_EFFORT,
  };
}
