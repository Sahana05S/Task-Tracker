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
