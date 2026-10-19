import { describe, expect, it } from 'vitest';
import { layoutMissionMap, mapCamera, type MapEntity } from '../internal/mission-map';

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
      { parentId: 'm1', children: [entity('sub', 'submission'), entity('a')] },
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
