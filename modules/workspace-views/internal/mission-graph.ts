// Pure geometry for the Today constellation: missions are stars placed by a
// seeded, fixed-iteration force layout (the same missions always land in the
// same place), real mission relations are the lines between them, and an opened
// mission or Quest fans its rows out around it. No data access, no randomness.

import type { TaskPriority } from '@/types/tracker';

export type GraphKind = 'mission' | 'quest' | 'objective' | 'more';
/**
 * What a star is, for its colour: a mission, a sub-mission (a mission another mission on the map holds,
 * or the parent's row linked to it), a Quest (a row with rows under it), an objective, or "more".
 */
export type GraphTone = 'mission' | 'submission' | 'quest' | 'objective' | 'more';
/** How the viewer is attached to a mission; drawn as the star's ring. */
export type GraphRelationship = 'crew' | 'reviewer' | 'observer';
/** `task_dependencies.relation_type` values the graph draws. Subtask runs parent → child. */
export type GraphRelation = 'Subtask' | 'Dependency' | 'Blocks' | 'Related';
export interface GraphEntity {
  id: string;
  kind: GraphKind;
  title: string;
  progress: number | null;
  complete: boolean;
  priority?: TaskPriority;
  relationship?: GraphRelationship | null;
  /** A checklist row linked to a sub-mission (`linked_task_id`). */
  linked?: boolean;
}
/** One stored relation between two missions (`from` is the predecessor / parent). */
export interface GraphLink { from: string; to: string; relation: GraphRelation }
/** Children shown for one opened node; levels follow the open path from the mission down. */
export interface GraphLevel { parentId: string; children: GraphEntity[] }
export interface GraphNode extends GraphEntity {
  x: number;
  y: number;
  /** Radius of the star. */
  r: number;
  depth: number;
  /** Connected group (kept for callers); the star's colour follows `tone`. */
  hue: number;
  tone: GraphTone;
  parentId: string | null;
}
export type GraphStroke = 'solid' | 'dashed' | 'dotted';
/** `relation`: a stored link between missions; `row`: an opened node to its rows; `origin`: the Quest or row a sub-mission hangs from. */
export type GraphEdgeKind = 'relation' | 'row' | 'origin';
export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  /** Null for the line from an opened node to its rows. */
  relation: GraphRelation | null;
  kind: GraphEdgeKind;
  stroke: GraphStroke;
  hue: number;
  fromTone: GraphTone;
  toTone: GraphTone;
  x1: number; y1: number; x2: number; y2: number;
  /** Control point of a curved line (origin lines); absent for straight ones. */
  cx?: number; cy?: number;
}
export interface MissionGraphLayout { nodes: GraphNode[]; edges: GraphEdge[]; width: number; height: number }
export interface GraphOptions {
  levels?: GraphLevel[];
  seed?: number;
  iterations?: number;
  /**
   * For the opened mission (levels[0]): each sub-mission's row path in its checklist, outermost first.
   * The sub-mission is then drawn from the deepest of those rows on the map instead of from the mission.
   */
  anchors?: Readonly<Record<string, readonly string[]>>;
}

export const GRAPH_HUES = 5;
/** Every coordinate is offset by this, so opening a branch never moves the world (or the camera) under the viewer. */
export const GRAPH_ORIGIN = 1600;
const PAD = 260;
/** Ideal distance between two missions. */
const K = 210;
/** Pull towards the centre; balances the all-pairs repulsion at roughly one label's width apart. */
const GRAVITY = 2.5;
const ITERATIONS = 320;
/** Label widths (px) the overlap check reserves under each star; the label sits below the star. */
export const LABEL_WIDTH = { mission: 150, child: 118 } as const;
/**
 * The height the label really takes under the star (6 November 2026): a two-line name, the line under it
 * and, for a mission, its labels line. Smaller values let labels run into the next star.
 */
const LABEL_HEIGHT = { mission: 72, child: 52 } as const;
/** How far a sub-mission sits beyond the Quest (or row) it hangs from, star edge to star edge. */
const ORIGIN_GAP = 70;
const GAP = 14;
const PRIORITY_RADIUS: Record<TaskPriority, number> = { Focus: 30, High: 26, Medium: 22, Low: 18, No: 16 };
const CHILD_RADIUS: Record<Exclude<GraphKind, 'mission'>, number> = { quest: 15, objective: 11, more: 11 };
/** Rows fan out up to this angle either side of their outward direction before starting another ring. */
const FAN_HALF_ANGLE = (150 * Math.PI) / 180;

const r1 = (n: number) => Math.round(n * 10) / 10;

export function graphRadius(e: Pick<GraphEntity, 'kind' | 'priority'>): number {
  return e.kind === 'mission' ? PRIORITY_RADIUS[e.priority ?? 'Medium'] ?? 22 : CHILD_RADIUS[e.kind];
}

/** FNV-1a: a stable 32-bit hash so positions depend on ids, never on Math.random. */
function hash(text: string, seed = 0): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

/** The box a node and its label occupy; overlap is checked between these. */
export function graphFootprint(n: Pick<GraphNode, 'x' | 'y' | 'r' | 'kind'>) {
  const mission = n.kind === 'mission';
  const half = Math.max(n.r, (mission ? LABEL_WIDTH.mission : LABEL_WIDTH.child) / 2);
  return { left: n.x - half, right: n.x + half, top: n.y - n.r, bottom: n.y + n.r + (mission ? LABEL_HEIGHT.mission : LABEL_HEIGHT.child) };
}
type Box = ReturnType<typeof graphFootprint>;
function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right + GAP && b.left < a.right + GAP && a.top < b.bottom + GAP && b.top < a.bottom + GAP;
}

/** Union-find over mission links, so each connected group of missions shares a colour. */
function components(ids: string[], links: GraphLink[]): Map<string, number> {
  const parent = new Map(ids.map(id => [id, id]));
  const find = (id: string): string => { let p = parent.get(id)!; while (p !== parent.get(p)) p = parent.get(p)!; parent.set(id, p); return p; };
  for (const l of links) { const a = find(l.from), b = find(l.to); if (a !== b) parent.set(a < b ? b : a, a < b ? a : b); }
  const roots = [...new Set(ids.map(find))];
  return new Map(ids.map(id => [id, roots.indexOf(find(id)) % GRAPH_HUES]));
}

interface Body { x: number; y: number }

/**
 * Force layout over the missions only: all-pairs repulsion, springs on stored relations and a weak pull to
 * the centre so unrelated missions stay in one sky. Bodies start on a golden-angle spiral in id order and
 * the temperature cools linearly over a fixed number of iterations, so the result is fully deterministic.
 */
function settle(ids: string[], links: GraphLink[], seed: number, iterations: number): Map<string, Body> {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const turn = ((hash('constellation', seed) % 3600) / 3600) * 2 * Math.PI;
  const bodies: Body[] = ids.map((_, i) => {
    const radius = K * 0.75 * Math.sqrt(i + 0.5), angle = turn + i * golden;
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
  const index = new Map(ids.map((id, i) => [id, i]));
  const springs = links.map(l => [index.get(l.from)!, index.get(l.to)!] as const);
  const n = bodies.length;
  const dx = new Float64Array(n), dy = new Float64Array(n);
  for (let step = 0; step < iterations; step++) {
    const t = K * 0.6 * (1 - step / iterations) + 0.5;
    dx.fill(0); dy.fill(0);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let x = bodies[i].x - bodies[j].x, y = bodies[i].y - bodies[j].y;
      let d = Math.hypot(x, y);
      if (d < 0.01) { const a = (hash(ids[i] + ids[j], seed) % 360) * Math.PI / 180; x = Math.cos(a); y = Math.sin(a); d = 1; }
      const f = (K * K) / d / d;
      dx[i] += x * f; dy[i] += y * f; dx[j] -= x * f; dy[j] -= y * f;
    }
    for (const [a, b] of springs) {
      const x = bodies[a].x - bodies[b].x, y = bodies[a].y - bodies[b].y, d = Math.max(Math.hypot(x, y), 0.01);
      const f = (3 * d) / K;
      dx[a] -= x * f; dy[a] -= y * f; dx[b] += x * f; dy[b] += y * f;
    }
    for (let i = 0; i < n; i++) {
      dx[i] -= bodies[i].x * GRAVITY; dy[i] -= bodies[i].y * GRAVITY;
      const d = Math.hypot(dx[i], dy[i]);
      if (d > 0) { const m = Math.min(d, t) / d; bodies[i].x += dx[i] * m; bodies[i].y += dy[i] * m; }
    }
  }
  return new Map(ids.map((id, i) => [id, bodies[i]]));
}

/**
 * Places `node` at the first free spot on its ray from (ox, oy), stepping outwards past anything already
 * placed. Placement is sequential, so earlier nodes never move and nothing overlaps at rest.
 */
function placeFree(node: GraphNode, placed: GraphNode[], ox: number, oy: number) {
  let ux = node.x - ox, uy = node.y - oy;
  const len = Math.hypot(ux, uy);
  if (len < 0.01) { const a = (hash(node.id) % 360) * Math.PI / 180; ux = Math.cos(a); uy = Math.sin(a); } else { ux /= len; uy /= len; }
  for (let guard = 0; guard < 400; guard++) {
    const box = graphFootprint(node);
    if (!placed.some(p => overlaps(box, graphFootprint(p)))) return;
    node.x += ux * 18; node.y += uy * 18;
  }
}

export function layoutMissionGraph(entities: GraphEntity[], links: GraphLink[], options: GraphOptions = {}): MissionGraphLayout {
  const { levels = [], seed = 1, iterations = ITERATIONS, anchors } = options;
  // Id order, not arrival order: the same set of missions always settles the same way.
  const missions = [...new Map(entities.filter(e => e.kind === 'mission').map(e => [e.id, e])).values()]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const ids = missions.map(m => m.id);
  const known = new Set(ids);
  // Only real records between missions on the map; one line per pair and relation.
  const seen = new Set<string>();
  const real = links.filter(l => {
    const key = `${l.relation}:${l.from}:${l.to}`;
    if (l.from === l.to || !known.has(l.from) || !known.has(l.to) || seen.has(key)) return false;
    seen.add(key); return true;
  }).sort((a, b) => {
    const ka = `${a.relation}:${a.from}:${a.to}`, kb = `${b.relation}:${b.from}:${b.to}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  const bodies = settle(ids, real, seed, iterations);
  const hues = components(ids, real);
  // A mission held by another mission on the map (Subtask) is a sub-mission.
  const subMissions = new Set(real.filter(l => l.relation === 'Subtask').map(l => l.to));
  const toneOf = (e: GraphEntity): GraphTone => e.kind === 'mission' ? (subMissions.has(e.id) ? 'submission' : 'mission')
    : e.linked ? 'submission' : e.kind;

  // Missions nearest the centre keep their spot; the rest step outwards until nothing overlaps.
  const nodes: GraphNode[] = [];
  const byDistance = [...missions].sort((a, b) => {
    const pa = bodies.get(a.id)!, pb = bodies.get(b.id)!;
    return Math.hypot(pa.x, pa.y) - Math.hypot(pb.x, pb.y) || (a.id < b.id ? -1 : 1);
  });
  for (const m of byDistance) {
    const body = bodies.get(m.id)!;
    const node: GraphNode = { ...m, x: body.x, y: body.y, r: graphRadius(m), depth: 0, hue: hues.get(m.id) ?? 0, tone: toneOf(m), parentId: null };
    placeFree(node, nodes, 0, 0);
    nodes.push(node);
  }
  const byId = new Map(nodes.map(n => [n.id, n]));
  const centre = nodes.length
    ? { x: nodes.reduce((s, n) => s + n.x, 0) / nodes.length, y: nodes.reduce((s, n) => s + n.y, 0) / nodes.length }
    : { x: 0, y: 0 };

  // Opened rows sit close around their node, fanning away from the sky's centre (or from the node's own
  // parent). They are placed against the opened path only; unrelated missions in the way step aside below.
  const missionNodes = [...nodes];
  const opened = new Set(levels.map(l => l.parentId));
  const held = missionNodes.filter(n => opened.has(n.id));
  const children: GraphNode[] = [];
  for (const level of levels) {
    const parent = byId.get(level.parentId);
    if (!parent) break;
    const from = parent.parentId ? byId.get(parent.parentId)! : centre;
    let dir = Math.atan2(parent.y - from.y, parent.x - from.x);
    if (Math.hypot(parent.y - from.y, parent.x - from.x) < 1) dir = -Math.PI / 2;
    const base = parent.r + (parent.depth === 0 ? 150 : 125);
    const spacing = 128;
    let ring = 0, slot = 0, radius = base;
    level.children.forEach(child => {
      if (byId.has(child.id)) return;
      // Slots alternate either side of the outward direction (0, +1, -1, +2, …); a position depends only
      // on the child's index, so loading more rows never moves the ones already shown.
      let step = spacing / radius;
      let capacity = 1 + 2 * Math.floor(FAN_HALF_ANGLE / step);
      if (slot >= capacity) { ring++; slot = 0; radius = base + ring * 110; step = spacing / radius; capacity = 1 + 2 * Math.floor(FAN_HALF_ANGLE / step); }
      const offset = slot === 0 ? 0 : (slot % 2 ? 1 : -1) * Math.ceil(slot / 2) * step;
      slot++;
      const angle = dir + offset + (ring % 2 ? step / 2 : 0);
      const node: GraphNode = { ...child, x: parent.x + radius * Math.cos(angle), y: parent.y + radius * Math.sin(angle),
        r: graphRadius(child), depth: parent.depth + 1, hue: parent.hue, tone: toneOf(child), parentId: parent.id };
      placeFree(node, held, parent.x, parent.y);
      held.push(node); children.push(node); nodes.push(node); byId.set(node.id, node);
    });
  }
  // With a mission opened, each of its sub-missions on the map hangs from the deepest row of its checklist
  // path that is shown (its Quest, or the linked row itself); without one, the mission line stays.
  const opener = levels.length && byId.has(levels[0].parentId) ? levels[0].parentId : null;
  const origins = new Map<string, GraphNode>();
  if (opener && anchors) for (const l of real) {
    if (l.relation !== 'Subtask' || l.from !== opener || opened.has(l.to)) continue;
    const via = [...(anchors[l.to] ?? [])].reverse().map(id => byId.get(id)).find(n => n && n.depth > 0);
    if (via) origins.set(l.to, via);
  }
  if (children.length) {
    // A sub-mission hanging from a row sits just beyond that row, straight out from the row's parent, so
    // its line is short and never crosses the other rows (user report, 6 November 2026). It is placed
    // with the opened rows, so unrelated missions step aside for it rather than it for them.
    for (const [subId, via] of [...origins].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const sub = byId.get(subId)!, from = byId.get(via.parentId!)!;
      let ux = via.x - from.x, uy = via.y - from.y;
      const len = Math.hypot(ux, uy) || 1; ux /= len; uy /= len;
      const reach = via.r + sub.r + ORIGIN_GAP;
      sub.x = via.x + ux * reach; sub.y = via.y + uy * reach;
      placeFree(sub, held, via.x, via.y);
      held.push(sub);
    }
    // Missions that would sit under the opened rows move straight out from the opened mission, nearest
    // first, until they are clear; every other mission stays exactly where it was.
    const anchor = held[0];
    const clash = (n: GraphNode) => held.some(h => overlaps(graphFootprint(n), graphFootprint(h)));
    const others = missionNodes.filter(n => !opened.has(n.id) && !origins.has(n.id));
    const placed = [...held, ...others.filter(n => !clash(n))];
    const moved = others.filter(clash).sort((a, b) => Math.hypot(a.x - anchor.x, a.y - anchor.y) - Math.hypot(b.x - anchor.x, b.y - anchor.y) || (a.id < b.id ? -1 : 1));
    for (const n of moved) { placeFree(n, placed, anchor.x, anchor.y); placed.push(n); }
  }

  for (const n of nodes) { n.x = r1(n.x + GRAPH_ORIGIN); n.y = r1(n.y + GRAPH_ORIGIN); }
  const line = (id: string, a: GraphNode, b: GraphNode, relation: GraphRelation | null, kind: GraphEdgeKind, stroke: GraphStroke, hue: number): GraphEdge =>
    ({ id, from: a.id, to: b.id, relation, kind, stroke, hue, fromTone: a.tone, toTone: b.tone, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  const edges: GraphEdge[] = [
    ...real.filter(l => !(l.relation === 'Subtask' && l.from === opener && origins.has(l.to)))
      .map(l => line(`${l.relation}:${l.from}:${l.to}`, byId.get(l.from)!, byId.get(l.to)!, l.relation, 'relation',
        l.relation === 'Subtask' ? 'solid' : l.relation === 'Related' ? 'dotted' : 'dashed', byId.get(l.from)!.hue)),
    ...nodes.filter(n => n.parentId).map(n => line(`row:${n.id}`, byId.get(n.parentId!)!, n, null, 'row', 'solid', n.hue)),
    ...[...origins].map(([to, via]) => line(`origin:${to}`, via, byId.get(to)!, 'Subtask', 'origin', 'solid', via.hue)),
  ];
  const width = Math.max(GRAPH_ORIGIN, ...nodes.map(n => graphFootprint(n).right)) + PAD;
  const height = Math.max(GRAPH_ORIGIN, ...nodes.map(n => graphFootprint(n).bottom)) + PAD;
  return { nodes, edges, width: r1(width), height: r1(height) };
}

export interface GraphCamera { x: number; y: number; z: number }
/**
 * Where to look: the whole sky, an opened node with its rows, or a selected row with its card (which opens
 * to the node's right).
 */
export function graphCamera(layout: MissionGraphLayout, focusId: string | null, view: { w: number; h: number }, expanded: boolean): GraphCamera {
  const fit = (boxes: Box[], maxZ: number, minZ: number, shiftX = 0): GraphCamera => {
    if (!boxes.length) return { x: GRAPH_ORIGIN, y: GRAPH_ORIGIN, z: 1 };
    const left = Math.min(...boxes.map(b => b.left)), right = Math.max(...boxes.map(b => b.right)) + shiftX;
    const top = Math.min(...boxes.map(b => b.top)), bottom = Math.max(...boxes.map(b => b.bottom));
    const z = Math.min((view.w - 32) / Math.max(right - left, 1), (view.h - 90) / Math.max(bottom - top, 1), maxZ);
    return { x: r1((left + right) / 2), y: r1((top + bottom) / 2 - 10), z: Math.round(Math.max(minZ, z) * 1000) / 1000 };
  };
  const focus = focusId ? layout.nodes.find(n => n.id === focusId) : undefined;
  if (!focus) return fit(layout.nodes.filter(n => n.depth === 0).map(graphFootprint), 1.05, 0.4);
  if (expanded) return fit(layout.nodes.filter(n => n.id === focus.id || n.parentId === focus.id).map(graphFootprint), 1.2, 0.4);
  // A selected row: the row and the 250 px card beside it.
  return fit([graphFootprint(focus)], 1.25, 0.45, 290);
}

/**
 * Zoom factor for one wheel event, or null when it should scroll the page instead. Only Ctrl/Cmd + wheel
 * zooms (a trackpad pinch arrives as ctrl + wheel): a mouse wheel steps, a pinch's small deltas glide.
 */
export function wheelZoomFactor(e: { deltaY: number; deltaMode: number; ctrlKey: boolean; metaKey: boolean }): number | null {
  if (!e.ctrlKey && !e.metaKey) return null;
  const delta = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
  return Math.min(1.25, Math.max(0.8, Math.exp(-delta * 0.002)));
}
