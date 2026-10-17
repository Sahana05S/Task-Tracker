'use server';

import { revalidatePath } from 'next/cache';
import type { PostgrestError } from '@supabase/supabase-js';

import { getCurrentProfile } from '@/shared/session/profile';
import { createClient } from '@/shared/supabase/server';
import type { ActionResponse } from '@/types/tracker';

/**
 * Settings Server Actions.
 *
 * Only the display name is editable. That is not an arbitrary limit: the
 * "Users can update their own profile" policy added in
 * `02_auth_provisioning.sql` pins `role` and `is_active` to their current values
 * in its WITH CHECK clause, so a member can correct their own name but cannot
 * promote themselves or reactivate a deactivated account.
 *
 * `employee_id` and `email` are left alone deliberately — the first is assigned
 * out of band and carries a unique constraint, and the second is owned by Supabase
 * Auth rather than by this table.
 */

export type SettingsActionState = ActionResponse<{ fullName: string }>;

const MAX_NAME_LENGTH = 100;

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function describeDatabaseError(error: PostgrestError): string {
  switch (error.code) {
    case '42501':
      return 'You do not have permission to change that.';
    case '23514':
      return 'That value is outside its permitted range.';
    default:
      return error.message;
  }
}

/** Updates the signed-in member's display name. */
export async function updateDisplayName(
  _prevState: SettingsActionState | null,
  formData: FormData,
): Promise<SettingsActionState> {
  const profile = await getCurrentProfile();

  if (!profile) {
    return { success: false, error: 'You are not signed in.' };
  }
  if (!profile.isActive) {
    return { success: false, error: 'Your account is deactivated.' };
  }

  const fullName = readString(formData, 'fullName');

  if (fullName === '') {
    return { success: false, error: 'Enter your full name.' };
  }
  if (fullName.length > MAX_NAME_LENGTH) {
    return {
      success: false,
      error: `Name must be ${MAX_NAME_LENGTH} characters or fewer.`,
    };
  }
  if (fullName === profile.fullName) {
    return { success: true, data: { fullName } };
  }

  const supabase = await createClient();

  // Scoped to the caller's own row. The policy would refuse anything else, but
  // saying so explicitly keeps the intent visible at the call site.
  const { error } = await supabase
    .from('users')
    .update({ full_name: fullName })
    .eq('id', profile.id);

  if (error) {
    return { success: false, error: describeDatabaseError(error) };
  }

  // The name appears in the rail initials, the account menu and every assignee
  // cell, so the whole workspace is stale.
  revalidatePath('/', 'layout');

  return { success: true, data: { fullName } };
}
