import { describe, expect, it } from 'vitest';
import { hashtagMatches, labelEdges, LABEL_EDGE_CAP, type HashtagNodeInput } from '../internal/graph-hashtags';

const L = 'label-mistake';

describe('hashtag highlight set', () => {
  const nodes: HashtagNodeInput[] = [
    { id: 'm1', taskTag: 'T-1', labelIds: [L] },
    { id: 'm2', taskTag: 'T-2', labelIds: ['other'] },
    { id: 'm3', taskTag: 'T-3', labelIds: [] },
    { id: 'm4', taskTag: 'T-4' },
    { id: 'q1', linkedTaskId: 'm1' },
    { id: 'q2', linkedTaskId: 'hidden-sub' },
    { id: 'o1', linkedTaskId: null },
  ];

  it('uses the loaded labels before labelled(slug) answers', () => {
    expect([...hashtagMatches(nodes, L)]).toEqual([['m1', 'label'], ['q1', 'linked']]);
  });

  it('adds missions, notes and linked rows labelled(slug) returned', () => {
    const m = hashtagMatches(nodes, L, { taskIds: ['m4', 'hidden-sub'], noteTaskTags: ['T-3'] });
    expect(Object.fromEntries(m)).toEqual({ m1: 'label', m3: 'note', m4: 'label', q1: 'linked', q2: 'linked' });
  });

  it('marks an opened Quest or objective whose own note carries the hashtag', () => {
    const m = hashtagMatches(nodes, L, { taskIds: [], noteTaskTags: [], noteNodeIds: ['o1', 'q1', 'not-opened'] });
    expect(Object.fromEntries(m)).toEqual({ m1: 'label', o1: 'note', q1: 'note' });
  });

  it('never matches a node the viewer was not given, nor a row that follows nothing', () => {
    const m = hashtagMatches(nodes, L, { taskIds: ['not-on-map'], noteTaskTags: ['T-9'], noteNodeIds: ['m2'] });
    expect(m.has('not-on-map')).toBe(false);
    expect(m.has('o1')).toBe(false);
    expect(m.has('m2')).toBe(false);
  });
});

describe('label lines', () => {
  const grid = Array.from({ length: 30 }, (_, i) => ({ id: `n${String(i).padStart(2, '0')}`, x: (i % 6) * 100, y: Math.floor(i / 6) * 100 }));
  const all = new Set(grid.map(n => n.id));

  it('joins matched nodes only, never a node to itself, one line per pair', () => {
    const edges = labelEdges([...grid, grid[0]], new Set(['n00', 'n01', 'n07', 'n29']));
    expect(edges.length).toBeGreaterThan(0);
    for (const e of edges) { expect(e.from).not.toBe(e.to); expect(['n00', 'n01', 'n07', 'n29']).toContain(e.from); expect(['n00', 'n01', 'n07', 'n29']).toContain(e.to); }
    const keys = edges.map(e => [e.from, e.to].sort().join('|'));
    expect(new Set(keys).size).toBe(keys.length);
    // Each matched node is joined to something.
    expect(new Set(edges.flatMap(e => [e.from, e.to]))).toEqual(new Set(['n00', 'n01', 'n07', 'n29']));
  });

  it('draws nothing for one match and is capped for many', () => {
    expect(labelEdges(grid, new Set(['n05']))).toEqual([]);
    expect(labelEdges(grid, all, 5)).toHaveLength(5);
    const many = Array.from({ length: 400 }, (_, i) => ({ id: `x${i}`, x: i * 7, y: (i * 13) % 300 }));
    expect(labelEdges(many, new Set(many.map(n => n.id))).length).toBeLessThanOrEqual(LABEL_EDGE_CAP);
  });

  it('is deterministic whatever the node order', () => {
    expect(labelEdges([...grid].reverse(), all)).toEqual(labelEdges(grid, all));
  });
});
