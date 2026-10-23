'use server';

import { getChecklistBranch } from '@/modules/checklists/internal/branch';
import type { ChecklistBranchRow } from '@/modules/checklists/internal/branch-types';
import { revalidateAfterChecklistChange } from '@/modules/checklists/internal/cache';
import type { ChecklistSection } from '@/modules/checklists/internal/progress';
import { runChecklistCommand } from '@/modules/checklists/internal/commands';
import { parseChecklistCommand } from '@/modules/checklists/internal/input';
import { getCurrentProfile } from '@/shared/session/profile';
import type { Json } from '@/types/database';
import type { ActionResponse } from '@/types/tracker';

/**
 * PUBLIC Server Action for every checklist change (create, add, edit, state,
 * map, delete, duplicate, section, mode). The `checklist_command` RPC checks
 * permissions and versions; this resolves the caller and parses the form.
 */
export async function checklistCommand(form: FormData): Promise<ActionResponse<Json>> {
  const profile = await getCurrentProfile();
  if (!profile?.isActive) return { success: false, error: 'Active authentication required.' };

  const input = parseChecklistCommand(form);
  if (!input.ok) return { success: false, error: input.error };

  const result = await runChecklistCommand(input.value);
  if (result.success) revalidateAfterChecklistChange();
  return result;
}

/** Rows under one row, or a checklist's top-level rows in one phase, for the outline view (bounded). */
export async function loadChecklistRows(
  taskId: string,
  where: { checklistId: string; parentNodeId?: string | null; section: ChecklistSection },
): Promise<ActionResponse<{ rows: ChecklistBranchRow[]; hasMore: boolean }>> {
  const profile = await getCurrentProfile();
  if (!profile?.isActive) return { success: false, error: 'Active authentication required.' };
  try {
    const branch = await getChecklistBranch(taskId, { checklistId: where.checklistId, parentNodeId: where.parentNodeId ?? undefined, section: where.section, limit: 100 });
    return { success: true, data: { rows: branch.rows, hasMore: branch.hasMore } };
  } catch {
    return { success: false, error: 'These rows could not be loaded.' };
  }
}
