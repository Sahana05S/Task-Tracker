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

/** Sub-mission node id → its owned checklist id, so structure pages can route Sub-missions to their own checklist. */
export async function getOwnedChecklists(taskId: string): Promise<ReadonlyMap<string, string>> {
  const db = await createClient();
  const { data, error } = await db.from('task_checklists').select('id,owner_node_id').eq('task_id', taskId).not('owner_node_id', 'is', null);
  if (error) return new Map();
  return new Map((data ?? []).map(row => [row.owner_node_id as string, row.id]));
}
