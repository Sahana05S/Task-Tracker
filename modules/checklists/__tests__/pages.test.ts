import { describe, expect, it } from 'vitest';

import { ancestry, childrenOf, formatMinutes, isContainer, subtreeSeconds } from '@/modules/checklists/internal/pages';
import type { ChecklistNode } from '@/types/tracker';

const node = (id: string, parentNodeId: string | null, nodeType: ChecklistNode['nodeType'] = 'Item'): ChecklistNode => ({
  id, parentNodeId, nodeType, checklistId: 'c', linkedTaskId: null, title: id, description: null, isComplete: false,
  section: 'activity', completionState: 'No', sortOrder: 0, estimatedMinutes: null, links: [], elapsedSeconds: 0,
  completedBy: null, completedAt: null, createdAt: '', updatedAt: '',
});

describe('nested checklist page helpers', () => {
  const nodes = [node('page', null, 'Page'), node('sub', 'page', 'Page'), node('leaf', 'sub'), node('item-parent', null), node('child', 'item-parent')];

  it('builds the root-to-node chain', () => {
    expect(ancestry('leaf', nodes).map(n => n.id)).toEqual(['page', 'sub', 'leaf']);
    expect(ancestry('page', nodes).map(n => n.id)).toEqual(['page']);
    expect(ancestry('missing', nodes)).toEqual([]);
  });

  it('stops at a cycle instead of looping', () => {
    const cyclic = [node('a', 'b'), node('b', 'a')];
    expect(ancestry('a', cyclic).map(n => n.id)).toEqual(['b', 'a']);
  });

  it('treats any node with rows under it, and only those, as a container', () => {
    expect(isContainer(nodes[1], nodes)).toBe(true);
    expect(isContainer(nodes[2], nodes)).toBe(false);
    expect(isContainer(nodes[3], nodes)).toBe(true);
    expect(isContainer(node('empty-page', null, 'Page'), nodes)).toBe(false);
    expect(childrenOf('page', nodes).map(n => n.id)).toEqual(['sub']);
    expect(childrenOf(null, nodes).map(n => n.id)).toEqual(['page', 'item-parent']);
  });

  it('formats whole minutes', () => {
    expect(formatMinutes(null)).toBeNull();
    expect(formatMinutes(0)).toBe('0 min');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(90)).toBe('1 h 30 min');
  });

  it('adds logged time for a page and everything inside it', () => {
    const seconds = new Map([['page', 60], ['sub', 120], ['leaf', 300], ['child', 30]]);
    expect(subtreeSeconds('leaf', nodes, seconds)).toBe(300);
    expect(subtreeSeconds('sub', nodes, seconds)).toBe(420);
    expect(subtreeSeconds('page', nodes, seconds)).toBe(480);
    expect(subtreeSeconds('item-parent', nodes, seconds)).toBe(30);
    expect(subtreeSeconds('a', [node('a', 'b'), node('b', 'a')], new Map([['a', 5], ['b', 7]]))).toBe(12);
  });
});
