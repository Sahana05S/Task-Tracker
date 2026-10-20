// PRIVATE. Decides what the /reset-password page shows.
import { getAuthState } from '@/shared/session/profile';

export const RESET_PASSWORD_PATH = '/reset-password';

export interface ResetPasswordSearchParams {
  code?: string;
  token_hash?: string;
  type?: string;
  error?: string;
}

export type ResetPasswordView =
  /** A recovery link landed here: the page hands it to /auth/callback. */
  | { kind: 'verify'; callbackPath: string }
  /** Signed in, normally by the recovery link: choose a new password. */
  | { kind: 'set-password' }
  /** Ask for an email address; `linkError` when a recovery link failed. */
  | { kind: 'request'; linkError: boolean };

/**
 * The /auth/callback URL that turns a recovery link into a session, or null
 * when the page was opened without one. Server Components cannot write the
 * session cookie, so the exchange happens in the callback route, which then
 * returns here signed in.
 */
export function recoveryCallbackPath(params: ResetPasswordSearchParams): string | null {
  const query = new URLSearchParams({ next: RESET_PASSWORD_PATH });
  if (params.code) {
    query.set('code', params.code);
  } else if (params.token_hash && params.type === 'recovery') {
    query.set('token_hash', params.token_hash);
    query.set('type', 'recovery');
  } else {
    return null;
  }
  return `/auth/callback?${query.toString()}`;
}

export async function resolveResetPasswordView(
  params: ResetPasswordSearchParams,
): Promise<ResetPasswordView> {
  const callbackPath = recoveryCallbackPath(params);
  if (callbackPath) return { kind: 'verify', callbackPath };
  if (params.error) return { kind: 'request', linkError: true };

  const { authUserId } = await getAuthState();
  return authUserId ? { kind: 'set-password' } : { kind: 'request', linkError: false };
}
