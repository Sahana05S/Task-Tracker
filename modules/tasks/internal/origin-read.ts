import 'server-only';

import { createClient } from '@/shared/supabase/server';
import { CHECKLIST_SECTIONS, type ChecklistSection } from '@/modules/checklists/client';
import type { SubMissionOriginRow } from './origin';

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
