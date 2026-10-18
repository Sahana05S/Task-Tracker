'use server';

import { revalidatePath } from 'next/cache';

import { parseDisplayName, saveOwnDisplayName } from '@/modules/team/internal/profile';
import { resolveActor } from '@/shared/session/actor';
import type { ActionResponse } from '@/types/tracker';

/** PUBLIC Server Actions for the signed-in member's own profile (Settings). */

export type SettingsActionState = ActionResponse<{ fullName: string }>;

/** Updates the signed-in member's display name. */
export async function updateDisplayName(
  _prevState: SettingsActionState | null,
  formData: FormData,
): Promise<SettingsActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };

  const name = parseDisplayName(formData);
  if (!name.ok) return { success: false, error: name.error };
  if (name.value === actor.profile.fullName) return { success: true, data: { fullName: name.value } };

  const error = await saveOwnDisplayName(actor.profile.id, name.value);
  if (error) return { success: false, error };

  // The name appears in the rail initials, the account menu and every assignee
  // cell, so the whole workspace is stale.
  revalidatePath('/', 'layout');
  return { success: true, data: { fullName: name.value } };
}
