import 'server-only';

import { createClient } from '@/shared/supabase/server';
import { CHECKLIST_SECTIONS, type ChecklistSection } from '@/modules/checklists/client';
import { subMissionAnchorPaths, type SubMissionAnchor, type SubMissionOriginRow } from './origin';

/**
 * The parent mission's checklist row linked to this sub-mission. Read under the caller's
 * session, so the checklist privacy of migration 117 applies: a viewer who may not read the
 * parent's checklist gets null (the page then links the parent mission only). A failed read
 * is also null; the origin link is a convenience, never a gate.
 */
export async function getSubMissionOriginRow(taskId: string, parentTaskId: string): Promise<SubMissionOriginRow | null> {
  try {
    const db = await createClient();
    const { data: rows, error } = await db.from('checklist_nodes')
      .select('id,title,checklist_id,parent_node_id,detail_section')
      .eq('linked_task_id', taskId)
      .order('created_at')
      .limit(5);
    if (error || !rows?.length) return null;
    const { data: lists } = await db.from('task_checklists')
      .select('id,task_id,owner_node_id')
      .in('id', [...new Set(rows.map((row) => row.checklist_id))]);
    const listById = new Map((lists ?? []).map((list) => [list.id, list]));
    const row = rows.find((candidate) => listById.get(candidate.checklist_id)?.task_id === parentTaskId);
    if (!row) return null;
    const containerId = row.parent_node_id ?? listById.get(row.checklist_id)?.owner_node_id ?? null;
    const container = containerId
      ? (await db.from('checklist_nodes').select('title').eq('id', containerId).maybeSingle()).data
      : null;
    const section = CHECKLIST_SECTIONS.includes(row.detail_section as ChecklistSection) ? row.detail_section as ChecklistSection : null;
    return {
      id: row.id,
      title: row.title,
      checklistId: row.checklist_id,
      parentNodeId: row.parent_node_id,
      section,
      containerTitle: container?.title ?? null,
    };
  } catch {
    return null;
  }
}

/** At most this many checklist rows are read to place a parent's sub-missions on the Today map. */
const ANCHOR_ROW_LIMIT = 2000;

/**
 * For the Today map: which Quest (or row) of this mission each of its sub-missions hangs from. Read
 * under the caller's session, so a viewer who may not read the checklist (migration 117) gets {}
 * and the map keeps its mission-to-sub-mission line. A failed read is also {}.
 */
export async function getSubMissionAnchors(parentTaskId: string): Promise<Record<string, SubMissionAnchor>> {
  try {
    const db = await createClient();
    const { data: lists, error } = await db.from('task_checklists').select('id,owner_node_id').eq('task_id', parentTaskId);
    if (error || !lists?.length) return {};
    const { data: nodes, error: nodeError } = await db.from('checklist_nodes')
      .select('id,checklist_id,parent_node_id,linked_task_id,detail_section')
      .in('checklist_id', lists.map((list) => list.id))
      .order('created_at')
      .limit(ANCHOR_ROW_LIMIT);
    if (nodeError || !nodes?.length) return {};
    return subMissionAnchorPaths(
      lists.map((list) => ({ id: list.id, ownerNodeId: list.owner_node_id })),
      nodes.map((node) => ({ id: node.id, checklistId: node.checklist_id, parentNodeId: node.parent_node_id, linkedTaskId: node.linked_task_id, section: node.detail_section ?? null })),
    );
  } catch {
    return {};
  }
}
