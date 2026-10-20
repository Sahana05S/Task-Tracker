// PRIVATE. Only files inside this module may import from internal/.
import type { ActionResponse } from '@/types/tracker';

/** Shape passed to `useActionState` by the login and signup forms. */
export type AuthActionState = ActionResponse<{ message: string }>;

/** Which pane of the auth form opens first. */
export type AuthMode = 'login' | 'signup';

/** A step that either produced a value or a user-facing error message. */
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export function failure(error: string): AuthActionState {
  return { success: false, error };
}

/**
 * The only reply to a password-reset request, whatever happened, so the form
 * never reveals whether an address has an account.
 */
export const RESET_REQUEST_MESSAGE = 'If that address has an account, an email is on its way.';
