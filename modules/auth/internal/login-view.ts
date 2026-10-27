// PRIVATE. Decides what the login page shows for the current visitor.
import { getAuthState } from '@/shared/session/profile';

import { resolveInitialMode } from './input';
import { safeRedirectPath } from './redirects';
import type { AuthMode } from './types';

export interface LoginSearchParams {
  redirectTo?: string;
  tab?: string;
  error?: string;
}

export type LoginView =
  /** Already signed in with a usable profile: nothing to do here. */
  | { kind: 'signed-in'; destination: string }
  | { kind: 'deactivated' }
  /**
   * Authenticated but unprovisioned. Do not redirect into the workspace; the
   * guarded layouts would send them straight back and the two would loop.
   */
  | { kind: 'orphaned' }
  | { kind: 'form'; destination: string; initialMode: AuthMode; error?: string };

/**
 * Messages the login page may show from `?error=`. Only these codes map to
 * text: echoing the parameter would let any link put its own words ("call
 * this number") on the sign-in page.
 */
export const LOGIN_ERRORS = {
  callback: 'Authentication verification failed. Please try signing in again.',
} as const;

function loginError(code: string | undefined): string | undefined {
  return code && Object.hasOwn(LOGIN_ERRORS, code) ? LOGIN_ERRORS[code as keyof typeof LOGIN_ERRORS] : undefined;
}

export async function resolveLoginView({
  redirectTo,
  tab,
  error,
}: LoginSearchParams): Promise<LoginView> {
  const destination = safeRedirectPath(redirectTo);
  const initialMode = resolveInitialMode(tab);
  const { authUserId, profile } = await getAuthState();

  if (profile?.isActive) return { kind: 'signed-in', destination };
  if (profile) return { kind: 'deactivated' };
  if (authUserId !== null) return { kind: 'orphaned' };
  return { kind: 'form', destination, initialMode, error: loginError(error) };
}
