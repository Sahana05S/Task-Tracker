import 'server-only';
import { createClient } from '@/shared/supabase/server';
import type { ChecklistBranch, ChecklistBranchOptions } from './branch-types';

/** A single bounded branch; PostgreSQL owns rollups and company/actor visibility. */
export async function getChecklistBranch(taskId: string, options: ChecklistBranchOptions = {}): Promise<ChecklistBranch> {
  const db = await createClient();
  const { data, error } = await db.rpc('checklist_branch', {
    p_task: taskId,
    p_checklist: options.checklistId ?? null,
    p_parent: options.parentNodeId ?? null,
    p_section: options.section ?? 'activity',
    p_offset: options.cursor ?? 0,
    p_limit: options.limit ?? 30,
  });
  if (error) throw new Error(`Checklist branch unavailable: ${error.message}`);
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.taskId !== taskId || !Array.isArray(data.rows)) {
    throw new Error('Checklist branch unavailable: invalid response.');
  }
  return data as unknown as ChecklistBranch;
}

/** Top-level rows with no section yet (older checklists), for the manager's "Needs mapping" list. */
export async function getUnmappedRootRows(checklistId: string): Promise<{ id: string; title: string }[]> {
  const db = await createClient();
  const { data, error } = await db.from('checklist_nodes').select('id,title')
    .eq('checklist_id', checklistId).is('detail_section', null).is('parent_node_id', null).order('sort_order');
  if (error) throw new Error(`Checklist rows unavailable: ${error.message}`);
  return data ?? [];
}
