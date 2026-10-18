'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { signInWithPassword, signOut, signUpAccount } from './internal/commands';
import { parseLoginInput, parseSignupInput } from './internal/input';
import { DEFAULT_REDIRECT } from './internal/redirects';
import { failure, type AuthActionState } from './internal/types';

/**
 * PUBLIC authentication Server Actions.
 *
 * All three follow the `ActionResponse<T>` contract from
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

/** Registers a new account as a `team_member`. */
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
          'Verification email sent! Check your inbox and click the confirmation link to activate your account.',
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
