import { describe, expect, it } from 'vitest';

import { subMissionAnchorPaths, type AnchorList, type AnchorNode } from '@/modules/tasks/internal/origin';

const node = (id: string, checklistId: string, parentNodeId: string | null = null, linkedTaskId: string | null = null, section: string | null = 'activity'): AnchorNode =>
  ({ id, checklistId, parentNodeId, linkedTaskId, section });

describe('where sub-missions hang in the parent checklist', () => {
  const lists: AnchorList[] = [{ id: 'root', ownerNodeId: null }, { id: 'questList', ownerNodeId: 'quest' }, { id: 'innerList', ownerNodeId: 'inner' }];

  it('walks rows, then each Quest that owns the list, up to the top', () => {
    const anchors = subMissionAnchorPaths(lists, [
      node('quest', 'root'), node('inner', 'questList'), node('link', 'innerList', null, 'child-1'),
      node('top', 'root', null, 'child-2', 'setup'),
      node('parentRow', 'questList', 'inner'), node('nested', 'questList', 'parentRow', 'child-3'),
    ]);
    expect(anchors['child-1']).toEqual({ path: ['quest', 'inner', 'link'], section: 'activity' });
    expect(anchors['child-2']).toEqual({ path: ['top'], section: 'setup' });
    expect(anchors['child-3'].path).toEqual(['quest', 'inner', 'parentRow', 'nested']);
  });

  it('keeps the first linking row, stops at loops and skips rows of unreadable lists', () => {
    const anchors = subMissionAnchorPaths(lists, [
      node('a', 'root', 'b', 'child-1'), node('b', 'root', 'a'),
      node('again', 'root', null, 'child-1'),
      node('hidden', 'otherList', null, 'child-4'),
      node('odd', 'root', null, 'child-5', 'weird'),
    ]);
    expect(anchors['child-1'].path).toEqual(['b', 'a']);
    expect(anchors['child-4']).toBeUndefined();
    expect(anchors['child-5'].section).toBeNull();
  });
});
