import { describe, expect, it } from 'vitest';
import { graphCamera, graphFootprint, graphRadius, layoutMissionGraph, type GraphEntity, type GraphLink, type GraphNode } from '../internal/mission-graph';

const mission = (id: string, priority: GraphEntity['priority'] = 'Medium'): GraphEntity => ({ id, kind: 'mission', title: id, progress: null, complete: false, priority });
const row = (id: string, kind: GraphEntity['kind'] = 'objective'): GraphEntity => ({ id, kind, title: id, progress: null, complete: false });
const ids = (n: number) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);

function overlapping(nodes: GraphNode[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = graphFootprint(nodes[i]), b = graphFootprint(nodes[j]);
    if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) out.push(`${nodes[i].id}/${nodes[j].id}`);
  }
  return out;
}
const at = (layout: { nodes: GraphNode[] }) => Object.fromEntries(layout.nodes.map(n => [n.id, [n.x, n.y]]));

describe('constellation layout', () => {
  const sky = ids(12).map(id => mission(id));
  const links: GraphLink[] = [
    { from: sky[0].id, to: sky[1].id, relation: 'Subtask' },
    { from: sky[0].id, to: sky[2].id, relation: 'Subtask' },
    { from: sky[3].id, to: sky[4].id, relation: 'Dependency' },
    { from: sky[5].id, to: sky[6].id, relation: 'Related' },
  ];

  it('is deterministic: the same missions land in the same place, whatever their order', () => {
    const a = layoutMissionGraph(sky, links);
    const b = layoutMissionGraph([...sky].reverse(), [...links].reverse());
    expect(at(b)).toEqual(at(a));
    expect(at(layoutMissionGraph(sky, links))).toEqual(at(a));
  });

  it('leaves no two nodes or labels overlapping at rest', () => {
    for (const n of [1, 2, 5, 20, 50]) expect(overlapping(layoutMissionGraph(ids(n).map(id => mission(id)), []).nodes)).toEqual([]);
    const opened = layoutMissionGraph(sky, links, { levels: [
      { parentId: sky[0].id, children: [row('q', 'quest'), ...Array.from({ length: 30 }, (_, i) => row(`o${i}`)), row('more', 'more')] },
      { parentId: 'q', children: Array.from({ length: 8 }, (_, i) => row(`q${i}`)) },
    ] });
    expect(opened.nodes).toHaveLength(12 + 32 + 8);
    expect(overlapping(opened.nodes)).toEqual([]);
  });

  it('keeps related missions closer than unrelated ones', () => {
    const { nodes } = layoutMissionGraph(sky, links);
    const p = (id: string) => nodes.find(n => n.id === id)!;
    const dist = (a: string, b: string) => Math.hypot(p(a).x - p(b).x, p(a).y - p(b).y);
    const linked = dist(sky[0].id, sky[1].id);
    const others = sky.slice(7).map(m => dist(sky[0].id, m.id));
    expect(linked).toBeLessThan(Math.max(...others));
  });

  it('draws only real relations between missions on the map, styled by kind', () => {
    const { edges } = layoutMissionGraph(sky, [...links,
      { from: sky[0].id, to: 'not-on-map', relation: 'Dependency' },
      { from: sky[7].id, to: sky[7].id, relation: 'Related' },
      { from: sky[0].id, to: sky[1].id, relation: 'Subtask' },
    ]);
    expect(edges.map(e => [e.relation, e.stroke])).toEqual([['Dependency', 'dashed'], ['Related', 'dotted'], ['Subtask', 'solid'], ['Subtask', 'solid']]);
    expect(layoutMissionGraph(sky, [{ from: sky[8].id, to: sky[9].id, relation: 'Blocks' }]).edges[0].stroke).toBe('dashed');
    expect(layoutMissionGraph(sky, []).edges).toEqual([]);
  });

  it('colours each connected group alike', () => {
    const { nodes } = layoutMissionGraph(sky, links);
    const hue = (id: string) => nodes.find(n => n.id === id)!.hue;
    expect(hue(sky[1].id)).toBe(hue(sky[0].id));
    expect(hue(sky[4].id)).toBe(hue(sky[3].id));
  });

  it('sizes missions by priority', () => {
    expect(graphRadius(mission('a', 'Focus'))).toBeGreaterThan(graphRadius(mission('a', 'High')));
    expect(graphRadius(mission('a', 'High'))).toBeGreaterThan(graphRadius(mission('a', 'Low')));
    expect(graphRadius(row('q', 'quest'))).toBeGreaterThan(graphRadius(row('o')));
  });

  it('holds the opened mission still, moves only missions under its rows, and keeps rows still as more load', () => {
    const closed = layoutMissionGraph(sky, links);
    const page = (n: number) => [{ parentId: sky[2].id, children: Array.from({ length: n }, (_, i) => row(`c${i}`)) }];
    const opened = layoutMissionGraph(sky, links, { levels: page(20) });
    const first = at(opened);
    expect(first[sky[2].id]).toEqual(at(closed)[sky[2].id]);
    const rows = opened.nodes.filter(n => n.parentId);
    for (const m of closed.nodes) {
      const box = graphFootprint(m);
      const underRows = rows.some(r => { const b = graphFootprint(r); return box.left < b.right + 14 && b.left < box.right + 14 && box.top < b.bottom + 14 && b.top < box.bottom + 14; });
      if (!underRows) expect(first[m.id]).toEqual([m.x, m.y]);
    }
    const more = at(layoutMissionGraph(sky, links, { levels: page(40) }));
    for (let i = 0; i < 20; i++) expect(more[`c${i}`]).toEqual(first[`c${i}`]);
  });

  it('nests opened levels with depth and links each row to its parent', () => {
    const layout = layoutMissionGraph(sky, [], { levels: [
      { parentId: sky[0].id, children: [row('q', 'quest'), row('a')] },
      { parentId: 'q', children: [row('deep')] },
      { parentId: 'missing', children: [row('x')] },
    ] });
    const deep = layout.nodes.find(n => n.id === 'deep')!;
    expect([deep.depth, deep.parentId]).toEqual([2, 'q']);
    expect(layout.nodes.some(n => n.id === 'x')).toBe(false);
    expect(layout.edges.filter(e => e.relation === null).map(e => e.id).sort()).toEqual(['row:a', 'row:deep', 'row:q']);
  });

  it('colours stars by kind: missions, sub-missions, Quests, objectives', () => {
    const layout = layoutMissionGraph(sky, links, { levels: [{ parentId: sky[3].id, children: [row('q', 'quest'), row('o'), { ...row('l'), linked: true }] }] });
    const tone = (id: string) => layout.nodes.find(n => n.id === id)!.tone;
    expect([tone(sky[0].id), tone(sky[1].id), tone(sky[2].id), tone(sky[3].id)]).toEqual(['mission', 'submission', 'submission', 'mission']);
    expect([tone('q'), tone('o'), tone('l')]).toEqual(['quest', 'objective', 'submission']);
    const rowLine = layout.edges.find(e => e.id === 'row:q')!;
    expect([rowLine.kind, rowLine.fromTone, rowLine.toTone]).toEqual(['row', 'mission', 'quest']);
  });

  it('draws a sub-mission from its Quest only while its parent mission is open', () => {
    const anchors = { [sky[1].id]: ['q', 'deep', 'linkRow'] };
    const direct = `Subtask:${sky[0].id}:${sky[1].id}`;
    // Collapsed: the mission line stays, whatever the anchors say.
    expect(layoutMissionGraph(sky, links, { anchors }).edges.map(e => e.id)).toContain(direct);
    // Opened at the top: the line leaves the Quest that holds the sub-mission, curved, and the mission line goes.
    const top = layoutMissionGraph(sky, links, { anchors, levels: [{ parentId: sky[0].id, children: [row('q', 'quest'), row('other', 'quest')] }] });
    const origin = top.edges.find(e => e.kind === 'origin')!;
    expect([origin.from, origin.to, origin.toTone]).toEqual(['q', sky[1].id, 'submission']);
    // A short straight thread (6 November 2026): the sub-mission sits just beyond its Quest.
    expect(origin.cx).toBeUndefined();
    expect(top.edges.map(e => e.id)).not.toContain(direct);
    // The other sub-mission has no anchor: its mission line is kept.
    expect(top.edges.map(e => e.id)).toContain(`Subtask:${sky[0].id}:${sky[2].id}`);
    // Opened deeper: the line starts at the deepest row shown.
    const deeper = layoutMissionGraph(sky, links, { anchors, levels: [
      { parentId: sky[0].id, children: [row('q', 'quest')] },
      { parentId: 'q', children: [row('deep', 'quest')] },
      { parentId: 'deep', children: [{ ...row('linkRow'), linked: true }] },
    ] });
    expect(deeper.edges.find(e => e.kind === 'origin')!.from).toBe('linkRow');
    // Anchored in a list that is not shown (another section): the mission line stays.
    const elsewhere = layoutMissionGraph(sky, links, { anchors, levels: [{ parentId: sky[0].id, children: [row('other', 'quest')] }] });
    expect(elsewhere.edges.some(e => e.kind === 'origin')).toBe(false);
    expect(elsewhere.edges.map(e => e.id)).toContain(direct);
  });

  it('puts each sub-mission next to its Quest, with a line that crosses no other star or label', () => {
    const anchors = { [sky[1].id]: ['q'], [sky[2].id]: ['q2', 'linkRow'] };
    const layout = layoutMissionGraph(sky, links, { anchors, levels: [
      { parentId: sky[0].id, children: [...Array.from({ length: 6 }, (_, i) => row(`o${i}`)), row('q', 'quest'), ...Array.from({ length: 6 }, (_, i) => row(`p${i}`)), row('q2', 'quest')] },
      { parentId: 'q2', children: [row('x0'), { ...row('linkRow'), linked: true }, row('x1')] },
    ] });
    expect(overlapping(layout.nodes)).toEqual([]);
    const origins = layout.edges.filter(e => e.kind === 'origin');
    expect(origins.map(e => [e.from, e.to]).sort()).toEqual([['linkRow', sky[2].id], ['q', sky[1].id]].sort());
    for (const e of origins) {
      // Close to the row it hangs from.
      expect(Math.hypot(e.x2 - e.x1, e.y2 - e.y1)).toBeLessThan(260);
      // Sampled along the line, no point falls inside another node's star or label.
      for (const n of layout.nodes) {
        if (n.id === e.from || n.id === e.to) continue;
        const box = graphFootprint(n);
        for (let t = 0; t <= 1; t += 0.02) {
          const x = e.x1 + (e.x2 - e.x1) * t, y = e.y1 + (e.y2 - e.y1) * t;
          expect(x > box.left && x < box.right && y > box.top && y < box.bottom, `${e.id} crosses ${n.id}`).toBe(false);
        }
      }
    }
  });

  it('aims the camera at the sky, an opened node or a selected row', () => {
    const layout = layoutMissionGraph(sky, links, { levels: [{ parentId: sky[0].id, children: [row('a'), row('b')] }] });
    const view = { w: 900, h: 560 };
    const all = graphCamera(layout, null, view, false);
    expect(all.z).toBeGreaterThanOrEqual(0.4);
    expect(all.z).toBeLessThanOrEqual(1.05);
    const open = graphCamera(layout, sky[0].id, view, true);
    expect(open.z).toBeGreaterThanOrEqual(all.z);
    const a = layout.nodes.find(n => n.id === 'a')!;
    expect(graphCamera(layout, 'a', view, false).x).toBeGreaterThan(a.x);
    expect(graphCamera(layoutMissionGraph([], []), null, view, false).z).toBe(1);
  });

  it('keeps every coordinate positive inside the world', () => {
    const layout = layoutMissionGraph(ids(50).map(id => mission(id)), []);
    for (const n of layout.nodes) {
      const box = graphFootprint(n);
      expect(box.left).toBeGreaterThan(0); expect(box.top).toBeGreaterThan(0);
      expect(box.right).toBeLessThan(layout.width); expect(box.bottom).toBeLessThan(layout.height);
    }
  });
});
