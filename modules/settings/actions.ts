'use server';

import { revalidatePath } from 'next/cache';

import { runSettingsCommand } from '@/modules/settings/internal/commands';
import { parseSettingsCommand } from '@/modules/settings/internal/input';
import { canManageCompanySettings } from '@/modules/settings/internal/permissions';
import { resolveActor } from '@/shared/session/actor';
import type { ActionResponse } from '@/types/tracker';

/**
 * PUBLIC Server Actions for Settings > Company. The role check only gives a
 * friendly message; `company_settings_command` enforces it in the database.
 */

export type CompanySettingsActionState = ActionResponse<{ version: number }>;

/** Saves one Company settings section (agenda, mission types, meeting types, standing missions or holidays). */
export async function saveCompanySettings(_prev: CompanySettingsActionState | null, form: FormData): Promise<CompanySettingsActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (!canManageCompanySettings(actor.profile.role)) return { success: false, error: 'Only a managing director can change company settings.' };
  const input = parseSettingsCommand(form);
  if (!input.ok) return { success: false, error: input.error };
  const result = await runSettingsCommand(input.value);
  if (!result.ok) return { success: false, error: result.error };
  // Labels, meeting types, the agenda and holiday marks appear across the workspace.
  revalidatePath('/', 'layout');
  return { success: true, data: { version: result.version } };
}
