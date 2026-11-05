import { checklistWorkHref, type ChecklistSection } from '@/modules/checklists/client';

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
