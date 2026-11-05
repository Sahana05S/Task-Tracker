// Hashtags on the Today constellation (lane 8, 5 November 2026). Pure helpers: which nodes on the map
// carry a chosen label, and the faint "label" lines between them. Both work only on what the viewer has
// already been given (labels_for on the loaded missions, labelled(slug) for the rest), so nothing the
// viewer may not read can appear. Label lines are separate from the layout: they never move a star and
// are never confused with structure (Mission > Quest) or stored relations (task_dependencies).

/** At most this many label lines are drawn, however many nodes match. */
export const LABEL_EDGE_CAP = 60;
/** Only this many matched nodes take part in the line builder (bounded work with many nodes and labels). */
const LABEL_EDGE_NODES = 200;

/** What labelled(slug) said about one label, reduced to what the graph needs. */
export interface HashtagRecords {
  /** Missions carrying the label (kind `task`). */
  readonly taskIds: readonly string[];
  /** Mission tags whose Mistakes and learning notes carry the label (kind `mission_learning`). */
  readonly learningTaskTags: readonly string[];
}

export type HashtagReason = 'label' | 'learning' | 'linked';

export interface HashtagNodeInput {
  readonly id: string;
  /** Missions only. */
  readonly taskTag?: string | null;
  /** Labels already read for this node (missions, through labels_for). */
  readonly labelIds?: readonly string[];
  /** A checklist row (Quest or objective) that follows a linked sub-mission. */
  readonly linkedTaskId?: string | null;
}

/**
 * The nodes that carry `labelId`, with why: the mission carries it ('label'), one of the mission's learning
 * notes does ('learning'), or a loaded row follows a linked mission that carries it ('linked').
 */
export function hashtagMatches(nodes: readonly HashtagNodeInput[], labelId: string, records: HashtagRecords | null = null): Map<string, HashtagReason> {
  const tasks = new Set(records?.taskIds ?? []);
  const learning = new Set(records?.learningTaskTags ?? []);
  // A mission known (from the loaded labels) to carry it counts as carrying it for its linked rows too.
  const isMission = (n: HashtagNodeInput) => n.taskTag !== undefined;
  for (const n of nodes) if (isMission(n) && n.labelIds?.includes(labelId)) tasks.add(n.id);
  const out = new Map<string, HashtagReason>();
  for (const n of nodes) {
    if (isMission(n)) {
      if (tasks.has(n.id)) out.set(n.id, 'label');
      else if (n.taskTag && learning.has(n.taskTag)) out.set(n.id, 'learning');
    } else if (n.linkedTaskId && tasks.has(n.linkedTaskId)) out.set(n.id, 'linked');
  }
  return out;
}

export interface LabelEdge { id: string; from: string; to: string; x1: number; y1: number; x2: number; y2: number }

/**
 * Faint lines between matched nodes: each matched node joins its nearest other matched node, so related
 * stars read as a group without a line between every pair. Never a node to itself, one line per pair,
 * at most `cap` lines, and the same input always gives the same lines.
 */
export function labelEdges(nodes: readonly { id: string; x: number; y: number }[], matched: ReadonlySet<string> | ReadonlyMap<string, unknown>, cap = LABEL_EDGE_CAP): LabelEdge[] {
  const seenIds = new Set<string>();
  const points = nodes.filter(n => matched.has(n.id) && !seenIds.has(n.id) && (seenIds.add(n.id), true))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, LABEL_EDGE_NODES);
  const pairs = new Set<string>();
  const edges: LabelEdge[] = [];
  for (const a of points) {
    if (edges.length >= cap) break;
    let best: (typeof points)[number] | null = null, bestD = Infinity;
    for (const b of points) {
      if (b.id === a.id) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < bestD || (d === bestD && best && b.id < best.id)) { best = b; bestD = d; }
    }
    if (!best) continue;
    const [from, to] = a.id < best.id ? [a, best] : [best, a];
    const key = `${from.id}|${to.id}`;
    if (pairs.has(key)) continue;
    pairs.add(key);
    edges.push({ id: `label:${key}`, from: from.id, to: to.id, x1: from.x, y1: from.y, x2: to.x, y2: to.y });
  }
  return edges;
}
