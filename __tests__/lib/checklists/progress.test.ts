import { describe, expect, it } from 'vitest';

import { computeChecklistProgress } from '@/lib/checklists/progress';

describe('computeChecklistProgress', () => {
  it('returns zero progress for an empty checklist', () => {
    expect(computeChecklistProgress([])).toEqual({
      overallProgressPercentage: 0,
      nodeProgress: [],
    });
  });

  it('treats leaf checklist items as equal-weight complete or incomplete items', () => {
    const result = computeChecklistProgress([
      { id: 'setup', parentNodeId: null, isComplete: true },
      { id: 'closure', parentNodeId: null, isComplete: false },
    ]);

    expect(result.overallProgressPercentage).toBe(50);
    expect(result.nodeProgress).toEqual(
      expect.arrayContaining([
        { id: 'setup', progressPercentage: 100, isComplete: true },
        { id: 'closure', progressPercentage: 0, isComplete: false },
      ]),
    );
  });

  it('rolls parent progress from child item count and completes only when every child is complete', () => {
    const result = computeChecklistProgress([
      { id: 'root', parentNodeId: null, isComplete: false },
      { id: 'a', parentNodeId: 'root', isComplete: true },
      { id: 'b', parentNodeId: 'root', isComplete: false },
      { id: 'c', parentNodeId: 'root', isComplete: true },
    ]);

    expect(result.overallProgressPercentage).toBeCloseTo(66.6667, 4);
    expect(result.nodeProgress).toEqual(
      expect.arrayContaining([
        {
          id: 'root',
          progressPercentage: 200 / 3,
          isComplete: false,
        },
      ]),
    );
  });

  it('supports nested reusable task-style nodes in the same equal-weight tree', () => {
    const result = computeChecklistProgress([
      { id: 'main-task', parentNodeId: null, isComplete: false },
      { id: 'subtask-page', parentNodeId: 'main-task', isComplete: false },
      { id: 'linked-real-task', parentNodeId: 'subtask-page', isComplete: true },
      { id: 'check-review', parentNodeId: 'subtask-page', isComplete: true },
    ]);

    expect(result.overallProgressPercentage).toBe(100);
    expect(result.nodeProgress).toEqual(
      expect.arrayContaining([
        { id: 'subtask-page', progressPercentage: 100, isComplete: true },
        { id: 'main-task', progressPercentage: 100, isComplete: true },
      ]),
    );
  });

  it('uses explicit linked task progress for task-style leaf nodes', () => {
    const result = computeChecklistProgress([
      { id: 'root', parentNodeId: null, isComplete: false },
      {
        id: 'linked-task',
        parentNodeId: 'root',
        isComplete: false,
        progressPercentage: 40,
      },
      { id: 'manual-item', parentNodeId: 'root', isComplete: true },
    ]);

    expect(result.overallProgressPercentage).toBe(70);
    expect(result.nodeProgress).toEqual(
      expect.arrayContaining([
        {
          id: 'linked-task',
          progressPercentage: 40,
          isComplete: false,
        },
        {
          id: 'root',
          progressPercentage: 70,
          isComplete: false,
        },
      ]),
    );
  });

  it('marks a linked task leaf complete when its explicit progress reaches 100', () => {
    const result = computeChecklistProgress([
      {
        id: 'linked-task',
        parentNodeId: null,
        isComplete: false,
        progressPercentage: 100,
      },
    ]);

    expect(result.overallProgressPercentage).toBe(100);
    expect(result.nodeProgress).toEqual([
      {
        id: 'linked-task',
        progressPercentage: 100,
        isComplete: true,
      },
    ]);
  });
});
