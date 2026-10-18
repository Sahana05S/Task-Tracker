'use server';

import { revalidateAfterChecklistChange } from '@/modules/checklists/internal/cache';
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
