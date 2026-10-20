'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { getAuthState } from '@/shared/session/profile';

import {
  requestPasswordReset,
  signInWithPassword,
  signOut,
  signUpAccount,
  updatePassword,
} from './internal/commands';
import {
  parseLoginInput,
  parseNewPasswordInput,
  parseResetRequestInput,
  parseSignupInput,
} from './internal/input';
import { DEFAULT_REDIRECT } from './internal/redirects';
import { failure, RESET_REQUEST_MESSAGE, type AuthActionState } from './internal/types';

/**
 * PUBLIC authentication Server Actions.
 *
 * All of them follow the `ActionResponse<T>` contract from
 * `reference/steering/tech-stack.md`. On success the login and signup actions redirect,
 * so they only ever *return* on failure or when a confirmation step is pending.
 */

export type { AuthActionState } from './internal/types';

/** Signs a user in with email and password. */
export async function login(
  _prevState: AuthActionState | null,
  formData: FormData,
): Promise<AuthActionState> {
  const input = parseLoginInput(formData);
  if (!input.ok) return failure(input.error);

  const error = await signInWithPassword(input.value);
  if (error) return failure(error);

  // The session cookie changed, so every cached layout render is now stale.
  revalidatePath('/', 'layout');
  redirect(input.value.redirectTo);
}

/** Creates the account for an invited email (invite-only, migration 49). */
export async function signup(
  _prevState: AuthActionState | null,
  formData: FormData,
): Promise<AuthActionState> {
  const input = parseSignupInput(formData);
  if (!input.ok) return failure(input.error);

  const outcome = await signUpAccount(input.value);
  if (!outcome.ok) return failure(outcome.error);

  // With email confirmation enabled, signUp succeeds but issues no session.
  // Report that instead of redirecting into a guarded route that would bounce
  // straight back to /login.
  if (!outcome.hasSession) {
    return {
      success: true,
      data: {
        message:
          'Check your inbox and click the confirmation link, then sign in. Only invited addresses get access.',
      },
    };
  }

  revalidatePath('/', 'layout');
  redirect(DEFAULT_REDIRECT);
}

/** Signs the current user out and returns them to the login view. */
export async function logout(): Promise<void> {
  await signOut();

  revalidatePath('/', 'layout');
  redirect('/login');
}

/**
 * Emails a password-recovery link. Anyone may ask, so there is no actor or
 * permission step. Apart from a malformed address, the reply is always the
 * same neutral message: it must not reveal whether the address has an account.
 */
export async function forgotPassword(
  _prevState: AuthActionState | null,
  formData: FormData,
): Promise<AuthActionState> {
  const input = parseResetRequestInput(formData);
  if (!input.ok) return failure(input.error);

  const error = await requestPasswordReset(input.value.email);
  // Rate limits and outages are logged for us, never shown to the visitor.
  if (error) console.error(`Password reset request failed: ${error}`);

  return { success: true, data: { message: RESET_REQUEST_MESSAGE } };
}

/** Sets a new password for the session a recovery link opened. */
export async function resetPassword(
  _prevState: AuthActionState | null,
  formData: FormData,
): Promise<AuthActionState> {
  const { authUserId } = await getAuthState();
  if (!authUserId) {
    return failure('Your reset link has expired. Request a new one from the sign-in page.');
  }

  const input = parseNewPasswordInput(formData);
  if (!input.ok) return failure(input.error);

  const error = await updatePassword(input.value.password);
  if (error) return failure(error);

  revalidatePath('/', 'layout');
  redirect(DEFAULT_REDIRECT);
}
