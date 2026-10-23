import { describe, expect, it } from 'vitest';
import { HORIZONTAL_SPREAD, layoutMissionMap, mapCamera, wheelZoomFactor, type MapEntity } from '../internal/mission-map';
import { parseRoadmapLocation, roadmapLayout, roadmapSearch } from '../internal/roadmap';

const entity = (id: string, kind: MapEntity['kind'] = 'item'): MapEntity => ({ id, kind, title: id, progress: null, complete: false });
const missions = ['m0', 'm1', 'm2'].map(id => entity(id, 'mission'));

describe('mission map layout', () => {
  it('alternates missions along the road and draws one road segment per gap', () => {
    const { nodes, road } = layoutMissionMap(missions, []);
    expect(nodes.map(n => n.side)).toEqual([1, -1, 1]);
    expect(nodes[1].y - nodes[0].y).toBe(120);
    expect(road.match(/C /g)).toHaveLength(2);
  });

  it('opens each branch on its mission side, through nested levels', () => {
    const { nodes, edges } = layoutMissionMap(missions, [
      { parentId: 'm1', children: [entity('sub', 'page'), entity('a')] },
      { parentId: 'sub', children: [entity('deep')] },
    ]);
    const m1 = nodes.find(n => n.id === 'm1')!, sub = nodes.find(n => n.id === 'sub')!, deep = nodes.find(n => n.id === 'deep')!;
    expect(sub.x).toBeLessThan(m1.x);
    expect(deep.x).toBeLessThan(sub.x);
    expect([sub.depth, deep.depth]).toEqual([1, 2]);
    expect(deep.hue).toBe(m1.hue);
    expect(edges.map(e => e.id).sort()).toEqual(['a', 'deep', 'sub']);
  });

  it('keeps existing nodes still when a branch opens', () => {
    const before = layoutMissionMap(missions, []).nodes[0];
    const after = layoutMissionMap(missions, [{ parentId: 'm1', children: Array.from({ length: 12 }, (_, i) => entity(`c${i}`)) }]).nodes[0];
    expect([after.x, after.y]).toEqual([before.x, before.y]);
  });

  it('keeps a first page of siblings still when more items load', () => {
    const page = (n: number) => [{ parentId: 'm1', children: [...Array.from({ length: n }, (_, i) => entity(`c${i}`)), entity('more:m1', 'more')] }];
    const before = layoutMissionMap(missions, page(20)).nodes.filter(n => n.parentId);
    const after = layoutMissionMap(missions, page(40)).nodes.filter(n => n.parentId);
    for (const node of before.slice(0, 20)) {
      const moved = after.find(n => n.id === node.id)!;
      expect([moved.x, moved.y]).toEqual([node.x, node.y]);
    }
  });

  it('ignores levels whose parent is not on the map', () => {
    expect(layoutMissionMap(missions, [{ parentId: 'missing', children: [entity('x')] }]).nodes).toHaveLength(3);
  });

  it('aims the camera towards an opened branch and clamps zoom', () => {
    const layout = layoutMissionMap(missions, [{ parentId: 'm0', children: [entity('a')] }]);
    const m0 = layout.nodes[0];
    const cam = mapCamera(layout, 'm0', { w: 900, h: 560 }, true);
    expect(cam.x).toBeGreaterThan(m0.x);
    expect(cam.z).toBeGreaterThanOrEqual(0.45);
    expect(mapCamera(layout, null, { w: 320, h: 480 }, false).z).toBeGreaterThanOrEqual(0.5);
  });
});

describe('horizontal mission map', () => {
  const levels = [
    { parentId: 'm1', children: [entity('sub', 'page'), entity('a'), entity('b')] },
    { parentId: 'sub', children: [entity('deep'), entity('deeper')] },
  ];
  const vertical = layoutMissionMap(missions, levels);
  const horizontal = layoutMissionMap(missions, levels, 'horizontal');
  const byId = (layout: typeof vertical, id: string) => layout.nodes.find(n => n.id === id)!;

  it('transposes every mission and the road exactly', () => {
    for (const id of ['m0', 'm1', 'm2']) {
      const v = byId(vertical, id), h = byId(horizontal, id);
      expect([h.x, h.y]).toEqual([v.y, v.x]);
      expect(h.side).toBe(v.side);
    }
    const swap = (d: string) => d.replace(/(-?[\d.]+) (-?[\d.]+)/g, '$2 $1');
    expect(horizontal.road).toBe(swap(vertical.road));
    const [plainV, plainH] = [layoutMissionMap(missions, []), layoutMissionMap(missions, [], 'horizontal')];
    expect([plainH.width, plainH.height]).toEqual([plainV.height, plainV.width]);
  });

  it('mirrors every branch node: the same distance off the road, siblings spread wider along it', () => {
    for (const node of vertical.nodes.filter(n => n.parentId)) {
      const v = node, h = byId(horizontal, node.id);
      const vp = byId(vertical, v.parentId!), hp = byId(horizontal, v.parentId!);
      expect(h.y - hp.y).toBeCloseTo(v.x - vp.x, 1);
      expect(h.x - hp.x).toBeCloseTo((v.y - vp.y) * HORIZONTAL_SPREAD, 0);
      expect([h.depth, h.side, h.hue, h.parentId]).toEqual([v.depth, v.side, v.hue, v.parentId]);
    }
  });

  it('draws every edge from its parent to its node in the transposed frame', () => {
    expect(horizontal.edges.map(e => e.id)).toEqual(vertical.edges.map(e => e.id));
    for (const edge of horizontal.edges) {
      const node = byId(horizontal, edge.id), parent = byId(horizontal, node.parentId!);
      expect(edge.d.startsWith(`M ${parent.x} ${parent.y} C `)).toBe(true);
      expect(edge.d.endsWith(` ${node.x} ${node.y}`)).toBe(true);
      // Leaves the parent heading away from the road (vertically), not sideways.
      const [, , , c1x, c1y] = edge.d.match(/M (\S+) (\S+) C (\S+) (\S+)/)!;
      expect(Number(c1x)).toBe(parent.x);
      expect(Math.sign(Number(c1y) - parent.y)).toBe(parent.side);
    }
  });

  it('fits a long horizontal road by its width and starts from the first mission', () => {
    const many = Array.from({ length: 24 }, (_, i) => entity(`r${i}`, 'mission'));
    const layout = layoutMissionMap(many, [], 'horizontal');
    const first = layout.nodes[0], lastRoot = layout.nodes.at(-1)!;
    const cam = mapCamera(layout, null, { w: 1000, h: 520 }, false);
    expect(cam.x).toBeLessThan((first.x + lastRoot.x) / 2);
    expect(cam.x - first.x).toBeLessThan(1000 / cam.z / 2);
    expect(cam.z).toBeGreaterThanOrEqual(0.5);
    // The camera's cross-road centre sits between the two lanes of missions.
    expect(cam.y).toBeCloseTo((layout.nodes[0].y + layout.nodes[1].y) / 2, 5);
  });

  it('aims at an opened branch on its side of the road', () => {
    const m1 = byId(horizontal, 'm1');
    const cam = mapCamera(horizontal, 'm1', { w: 900, h: 560 }, true);
    expect(cam.x).toBe(m1.x);
    expect(Math.sign(cam.y - m1.y)).toBe(m1.side);
  });
});

describe('map wheel', () => {
  const wheel = (deltaY: number, mods: { ctrlKey?: boolean; metaKey?: boolean } = {}, deltaMode = 0) => ({ deltaY, deltaMode, ctrlKey: false, metaKey: false, ...mods });
  it('leaves a plain wheel to scroll the page', () => {
    expect(wheelZoomFactor(wheel(100))).toBeNull();
    expect(wheelZoomFactor(wheel(-3))).toBeNull();
  });
  it('zooms on Ctrl or Cmd + wheel, in steps for a mouse and gently for a pinch', () => {
    expect(wheelZoomFactor(wheel(-100, { ctrlKey: true }))!).toBeGreaterThan(1);
    expect(wheelZoomFactor(wheel(100, { metaKey: true }))!).toBeLessThan(1);
    expect(wheelZoomFactor(wheel(-2, { ctrlKey: true }))!).toBeLessThan(1.01);
    expect(wheelZoomFactor(wheel(-5000, { ctrlKey: true }))).toBe(1.25);
    expect(wheelZoomFactor(wheel(3, { ctrlKey: true }, 1))!).toBeLessThan(1);
  });
});

describe('roadmap URL layout', () => {
  it('round-trips the horizontal layout and leaves vertical out of the URL', () => {
    const search = roadmapSearch({ missionId: '00000000-0000-4000-8000-000000000001', section: 'activity' }, 'today', 'roadmap', 'horizontal');
    const query = Object.fromEntries(new URLSearchParams(search.slice(1)));
    expect(roadmapLayout(query.layout)).toBe('horizontal');
    expect(parseRoadmapLocation(query)?.missionId).toBe('00000000-0000-4000-8000-000000000001');
    expect(roadmapSearch(null, 'all', 'roadmap', 'vertical')).toBe('/today');
    expect(roadmapLayout(undefined)).toBeNull();
    expect(roadmapLayout('diagonal')).toBeNull();
  });
});
