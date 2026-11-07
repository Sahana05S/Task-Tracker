/**
 * Where a checklist row may move (migration 133): the mission's main list and every Quest list,
 * as an indented tree. PRIVATE (type and helpers re-exported by client.ts). The tree is built on
 * the server from `checklist_move_targets`; the row menu only marks the choices that do not fit.
 */

export interface MoveTarget {
  checklistId: string;
  /** The Quest row that owns this list; null for the mission's main list. */
  nodeId: string | null;
  title: string;
  ownerName: string | null;
  /** Whether the viewer may change this list (`can_edit_quest_list`). */
  canEdit: boolean;
  /** 0 for the main list, 1 for a Quest in it, and so on. */
  depth: number;
  /** The lists above this one, outermost first (the main list first). */
  path: string[];
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const list = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object') : [];

/** Orders the RPC's flat list as a tree: the main list, then each Quest followed by the Quests inside it. */
export function buildMoveTargets(data: unknown): MoveTarget[] {
  const rows = list(data).map((row) => ({
    checklistId: text(row.checklistId),
    nodeId: text(row.nodeId) || null,
    parentChecklistId: text(row.parentChecklistId) || null,
    title: text(row.title) || 'Quest',
    ownerName: text(row.assigneeName) || null,
    canEdit: row.canEdit === true,
  })).filter((row) => row.checklistId);
  const root = rows.find((row) => !row.nodeId);
  if (!root) return [];
  const children = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.parentChecklistId) continue;
    children.set(row.parentChecklistId, [...(children.get(row.parentChecklistId) ?? []), row]);
  }
  const out: MoveTarget[] = [];
  const seen = new Set<string>();
  const walk = (row: (typeof rows)[number], path: string[]) => {
    if (seen.has(row.checklistId)) return;
    seen.add(row.checklistId);
    out.push({ checklistId: row.checklistId, nodeId: row.nodeId, title: row.title, ownerName: row.ownerName, canEdit: row.canEdit, depth: path.length, path });
    for (const child of children.get(row.checklistId) ?? []) walk(child, [...path, row.checklistId]);
  };
  walk(root, []);
  return out;
}

/** Why a row cannot move into a list, or null when it can. */
export function moveBlockedReason(
  target: MoveTarget,
  row: { checklistId: string; ownedChecklistId?: string | null },
): string | null {
  if (target.checklistId === row.checklistId) return 'This row is here';
  if (row.ownedChecklistId && (target.checklistId === row.ownedChecklistId || target.path.includes(row.ownedChecklistId))) return 'Inside this Quest';
  if (!target.canEdit) return target.ownerName ? `Only ${target.ownerName}, the owners above and managers` : 'Only its owner, the owners above and managers';
  return null;
}
