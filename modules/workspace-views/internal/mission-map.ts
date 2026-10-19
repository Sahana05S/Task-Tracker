// Pure geometry for the Today mission map: missions wind down a central road,
// and each opened branch fans out on its mission's side. No data access.

export type MapKind = 'mission' | 'submission' | 'page' | 'item' | 'more';
export interface MapEntity {
  id: string;
  kind: MapKind;
  title: string;
  progress: number | null;
  complete: boolean;
}
/** Children shown for one opened node; levels follow the open path from the mission down. */
export interface MapLevel { parentId: string; children: MapEntity[] }
export interface MapNode extends MapEntity {
  x: number;
  y: number;
  side: -1 | 1;
  depth: number;
  hue: number;
  parentId: string | null;
}
export interface MapEdge { id: string; d: string; hue: number }
export interface MissionMapLayout { nodes: MapNode[]; edges: MapEdge[]; road: string; width: number; height: number }

const ROOT_X = [490, 230];
const ROOT_GAP = 120;
const DISTANCE = [255, 235, 208];
const SPACING = [143, 130, 107];
const PAD = 190;
/** Room for about five nested levels to the left and twenty siblings above the first mission. */
export const ORIGIN = { x: 1300, y: 900 };
export const MAP_HUES = 5;

const r = (n: number) => Math.round(n * 10) / 10;

export function layoutMissionMap(missions: MapEntity[], levels: MapLevel[]): MissionMapLayout {
  const nodes: MapNode[] = missions.map((m, i) => {
    const x = ROOT_X[i % 2];
    return { ...m, x, y: 110 + i * ROOT_GAP, side: x < 360 ? -1 : 1, depth: 0, hue: i % MAP_HUES, parentId: null };
  });
  const byId = new Map(nodes.map(n => [n.id, n]));
  for (const level of levels) {
    const parent = byId.get(level.parentId);
    if (!parent) break;
    const d = Math.min(parent.depth, DISTANCE.length - 1);
    const count = level.children.length;
    const spacing = SPACING[d] * (count > 5 ? 0.78 : 1);
    level.children.forEach((child, i) => {
      if (byId.has(child.id)) return;
      const node: MapNode = { ...child, x: parent.x + parent.side * DISTANCE[d], y: parent.y + (i - (count - 1) / 2) * spacing,
        side: parent.side, depth: parent.depth + 1, hue: parent.hue, parentId: parent.id };
      nodes.push(node); byId.set(node.id, node);
    });
  }
  // A fixed origin keeps existing nodes still while branches open; the world is sized to cover them.
  for (const n of nodes) { n.x = r(n.x + ORIGIN.x); n.y = r(n.y + ORIGIN.y); }
  const width = Math.max(...nodes.map(n => n.x), 0) + PAD + 260, height = Math.max(...nodes.map(n => n.y), 0) + PAD;
  const edges: MapEdge[] = nodes.flatMap(n => {
    const p = n.parentId ? byId.get(n.parentId) : undefined;
    if (!p) return [];
    const t = Math.min(125, Math.abs(n.x - p.x) * 0.48);
    return [{ id: n.id, hue: n.hue, d: `M ${p.x} ${p.y} C ${r(p.x + p.side * t)} ${p.y} ${r(n.x - p.side * t)} ${n.y} ${n.x} ${n.y}` }];
  });
  const roots = nodes.slice(0, missions.length);
  const road = roots.length ? roots.slice(1).reduce((path, b, i) => {
    const a = roots[i], half = (b.y - a.y) / 2;
    return `${path} C ${a.x} ${r(a.y + half)} ${b.x} ${r(b.y - half)} ${b.x} ${b.y}`;
  }, `M ${roots[0].x} ${roots[0].y}`) : '';
  return { nodes, edges, road, width: r(width), height: r(height) };
}

export interface Camera { x: number; y: number; z: number }
/** Where to look: the whole road, an opened branch (shifted towards its children) or a selected leaf and its card. */
export function mapCamera(layout: MissionMapLayout, focusId: string | null, view: { w: number; h: number }, expanded: boolean): Camera {
  const focus = focusId ? layout.nodes.find(n => n.id === focusId) : undefined;
  if (!focus) {
    const roots = layout.nodes.filter(n => n.depth === 0);
    if (!roots.length) return { x: layout.width / 2, y: layout.height / 2, z: 1 };
    const top = roots[0].y, bottom = roots.at(-1)!.y;
    const fit = Math.min((view.w - 24) / 520, (view.h - 80) / Math.min(620, bottom - top + 160), 1.04);
    // Long roads start at the top rather than shrinking every mission out of reach.
    const centreY = Math.min((top + bottom) / 2, top + (view.h / 2 - 70) / Math.max(fit, 0.5));
    return { x: (roots[0].x + (roots[1]?.x ?? roots[0].x)) / 2, y: centreY, z: Math.max(0.5, fit) };
  }
  const offset = expanded ? (focus.depth === 0 ? 112 : 103) : 93;
  const z = Math.min((view.w - 24) / (expanded ? 480 : 430), (view.h - 85) / (expanded ? 410 : 310), [1.05, 1.18, 1.3, 1.38][Math.min(3, focus.depth)]);
  return { x: focus.x + focus.side * offset, y: focus.y, z: Math.max(0.45, z) };
}
