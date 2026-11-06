import { CHECKLIST_SECTIONS, checklistWorkHref, type ChecklistSection } from '@/modules/checklists/client';

/** The parent checklist row that holds a sub-mission (`checklist_nodes.linked_task_id`). */
export interface SubMissionOriginRow {
  id: string;
  title: string;
  checklistId: string;
  parentNodeId: string | null;
  section: ChecklistSection | null;
  /** The row or Quest the parent row sits under; null at the top of the master checklist. */
  containerTitle: string | null;
}

/**
 * Where a sub-mission came from. `row`: the exact parent row, when the viewer can read the
 * parent's checklist (migration 117). `mission`: only the parent mission ("Part of TAG").
 */
export type SubMissionOrigin =
  | { kind: 'row'; parentTag: string; href: string; label: string; path: string }
  | { kind: 'mission'; parentTag: string; href: string }
  | null;

/** Builds the header link from the parent mission and its row (null when the row is unreadable). */
export function resolveSubMissionOrigin(parent: { taskTag: string } | null, row: SubMissionOriginRow | null): SubMissionOrigin {
  if (!parent) return null;
  const missionHref = `/tasks/${encodeURIComponent(parent.taskTag)}`;
  if (!row) return { kind: 'mission', parentTag: parent.taskTag, href: missionHref };
  const href = checklistWorkHref(parent.taskTag, {
    checklistId: row.checklistId,
    parentNodeId: row.parentNodeId ?? undefined,
    section: row.section ?? 'activity',
  }, row.id);
  const label = row.containerTitle ?? row.title;
  const path = [row.containerTitle, row.title].filter(Boolean).join(' › ');
  return { kind: 'row', parentTag: parent.taskTag, href, label, path };
}

/** Where one sub-mission hangs in its parent's checklist: rows from the top of the master checklist down to the linking row. */
export interface SubMissionAnchor {
  /** Row ids, outermost first; the last one is the row linked to the sub-mission. */
  path: string[];
  section: ChecklistSection | null;
}
export interface AnchorList { id: string; ownerNodeId: string | null }
export interface AnchorNode { id: string; checklistId: string; parentNodeId: string | null; linkedTaskId: string | null; section: string | null }

/**
 * For each row linked to a sub-mission, the chain of rows above it: parent rows in the same list, then
 * the Quest that owns the list (a row in its parent list), and so on to the top. A row whose list is
 * missing (not readable) or a loop stops the walk; the chain found so far is kept. The first linking
 * row per sub-mission wins (rows arrive in created order).
 */
export function subMissionAnchorPaths(lists: readonly AnchorList[], nodes: readonly AnchorNode[]): Record<string, SubMissionAnchor> {
  const owner = new Map(lists.map((list) => [list.id, list.ownerNodeId]));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const out: Record<string, SubMissionAnchor> = {};
  for (const node of nodes) {
    if (!node.linkedTaskId || out[node.linkedTaskId] || !owner.has(node.checklistId)) continue;
    const path: string[] = [];
    const seen = new Set<string>();
    let current: AnchorNode | undefined = node;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      path.unshift(current.id);
      const up: string | null | undefined = current.parentNodeId ?? owner.get(current.checklistId);
      current = up ? byId.get(up) : undefined;
    }
    const section = CHECKLIST_SECTIONS.includes(node.section as ChecklistSection) ? node.section as ChecklistSection : null;
    out[node.linkedTaskId] = { path, section };
  }
  return out;
}
