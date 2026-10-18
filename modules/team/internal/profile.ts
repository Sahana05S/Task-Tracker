import type { PostgrestError } from '@supabase/supabase-js';

import { readString } from '@/shared/forms/form-data';
import { createClient } from '@/shared/supabase/server';

/**
 * A member's own profile. PRIVATE.
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

const MAX_NAME_LENGTH = 100;

/** Reads and validates the display name field. */
export function parseDisplayName(formData: FormData): { ok: true; value: string } | { ok: false; error: string } {
  const fullName = readString(formData, 'fullName');
  if (fullName === '') return { ok: false, error: 'Enter your full name.' };
  if (fullName.length > MAX_NAME_LENGTH) return { ok: false, error: `Name must be ${MAX_NAME_LENGTH} characters or fewer.` };
  return { ok: true, value: fullName };
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

/** Writes the caller's own display name. Returns an error message, or null on success. */
export async function saveOwnDisplayName(userId: string, fullName: string): Promise<string | null> {
  const supabase = await createClient();
  // Scoped to the caller's own row. The policy would refuse anything else, but
  // saying so explicitly keeps the intent visible at the call site.
  const { error } = await supabase.from('users').update({ full_name: fullName }).eq('id', userId);
  return error ? describeDatabaseError(error) : null;
}
