import { describe, expect, it } from 'vitest';

import {
  addNode,
  changeSection,
  nextNodeKey,
  parentOptions,
  removeNode,
  sectionCounts,
  sectionRows,
  toEditorNodes,
  toPayloadNodes,
  type EditorNode,
} from '@/modules/tasks/components/templates/nodes';

const row = (key: string, section: EditorNode['section'], parent = '', node_type: EditorNode['node_type'] = 'Item'): EditorNode =>
  ({ key, title: key, section, node_type, parent_key: parent });

// setup: G > (A, P > B); activity: X
const tree: EditorNode[] = [
  row('G', 'setup', '', 'Group'),
  row('X', 'activity'),
  row('A', 'setup', 'G'),
  row('P', 'setup', 'G', 'Page'),
  row('B', 'setup', 'P'),
];

describe('template checklist rows', () => {
  it('adds an empty item at the end of the chosen section with a fresh key', () => {
    const next = addNode(tree, 'closure');
    expect(next).toHaveLength(6);
    expect(next[5]).toEqual({ key: 'node6', title: '', section: 'closure', node_type: 'Item', parent_key: '' });
  });

  it('keeps keys unique after a loaded template', () => {
    expect(nextNodeKey([{ key: 'node2' }, { key: 'node3' }])).toBe('node4');
    expect(nextNodeKey([{ key: 'node3' }, { key: 'node4' }])).toBe('node5');
  });

  it('removes a row with everything nested under it', () => {
    expect(removeNode(tree, 'P').map((node) => node.key)).toEqual(['G', 'X', 'A']);
    expect(removeNode(tree, 'G').map((node) => node.key)).toEqual(['X']);
    expect(removeNode(tree, 'B').map((node) => node.key)).toEqual(['G', 'X', 'A', 'P']);
  });

  it('moves a row to another section with its nested rows, top level and last', () => {
    const moved = changeSection(tree, 'P', 'closure');
    expect(moved.map((node) => node.key)).toEqual(['G', 'X', 'A', 'P', 'B']);
    expect(moved.find((node) => node.key === 'P')).toMatchObject({ section: 'closure', parent_key: '' });
    expect(moved.find((node) => node.key === 'B')).toMatchObject({ section: 'closure', parent_key: 'P' });
    expect(sectionRows(moved, 'setup').map(({ node }) => node.key)).toEqual(['G', 'A']);

    const intoActivity = changeSection(tree, 'G', 'activity');
    expect(sectionRows(intoActivity, 'activity').map(({ node, depth }) => [node.key, depth])).toEqual([
      ['X', 0], ['G', 0], ['A', 1], ['P', 1], ['B', 2],
    ]);
  });

  it('lists a section in display order with depths', () => {
    const shuffled = [row('A', 'setup'), row('B', 'setup'), row('C', 'setup', 'A'), row('D', 'setup', 'missing')];
    expect(sectionRows(shuffled, 'setup').map(({ node, depth }) => [node.key, depth])).toEqual([
      ['A', 0], ['C', 1], ['B', 0], ['D', 0],
    ]);
    expect(sectionRows(tree, 'closure')).toEqual([]);
  });

  it('offers only earlier rows of the same section as parents', () => {
    expect(parentOptions(tree, 'B').map((node) => node.key)).toEqual(['G', 'A', 'P']);
    expect(parentOptions(tree, 'X')).toEqual([]);
    expect(parentOptions(tree, 'G')).toEqual([]);
  });

  it('counts rows per section', () => {
    expect(sectionCounts(tree)).toEqual({ setup: 4, activity: 1, closure: 0 });
    expect(sectionCounts(undefined)).toEqual({ setup: 0, activity: 0, closure: 0 });
  });

  it('round-trips the saved shape section by section with null top-level parents', () => {
    const loaded = toEditorNodes([
      { key: 'n1', title: 'Close out', section: 'closure', node_type: 'Item', parent_key: null, description: 'kept' },
      { key: 'n2', title: 'Kick-off', section: 'setup', node_type: 'Group' },
      { key: 'n3', title: 'Brief', section: 'setup', node_type: 'Item', parent_key: 'n2' },
    ]);
    expect(loaded.map((node) => node.parent_key)).toEqual(['', '', 'n2']);
    expect(toPayloadNodes(loaded)).toEqual([
      { key: 'n2', title: 'Kick-off', section: 'setup', node_type: 'Group', parent_key: null },
      { key: 'n3', title: 'Brief', section: 'setup', node_type: 'Item', parent_key: 'n2' },
      { key: 'n1', title: 'Close out', section: 'closure', node_type: 'Item', parent_key: null, description: 'kept' },
    ]);
  });
});
