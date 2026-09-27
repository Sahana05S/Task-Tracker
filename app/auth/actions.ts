'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { DEFAULT_REDIRECT, safeRedirectPath } from '@/lib/auth/redirects';
import { createClient } from '@/lib/supabase/server';
import type { ActionResponse } from '@/types/tracker';

/**
 * Authentication Server Actions.
 *
 * All three follow the `ActionResponse<T>` contract from
 * `steering/tech-stack.md`. On success the login and signup actions redirect,
 * so they only ever *return* on failure or when a confirmation step is pending.
 */

/** Shape passed to `useActionState` by the login and signup forms. */
export type AuthActionState = ActionResponse<{ message: string }>;

const MIN_PASSWORD_LENGTH = 8;

/* -------------------------------------------------------------------------- */
/* Input handling                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Reads a trimmed string from `FormData`. `FormData.get` returns
 * `string | File | null`, so the type guard keeps `File` and `null` out without
 * resorting to a cast.
 */
function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function isPlausibleEmail(email: string): boolean {
  // Deliberately permissive. Supabase performs the authoritative check; this
  // only catches obvious typos before spending a network round trip.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

/** Signs a user in with email and password. */
export async function login(
  _prevState: AuthActionState | null,
  formData: FormData,
): Promise<AuthActionState> {
  const email = readString(formData, 'email');
  const password = readString(formData, 'password');
  const redirectTo = safeRedirectPath(readString(formData, 'redirectTo'));

  if (!email || !password) {
    return { success: false, error: 'Enter both your email and password.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (error.message.toLowerCase().includes('email not confirmed')) {
      return {
        success: false,
        error:
          'Please verify your email address before signing in. Check your inbox for the confirmation link.',
      };
    }
    return { success: false, error: error.message };
  }

  // The session cookie changed, so every cached layout render is now stale.
  revalidatePath('/', 'layout');
  redirect(redirectTo);
}

/**
 * Registers a new account.
 *
 * `full_name` and `employee_id` travel as auth metadata; the
 * `handle_new_user` trigger from `02_auth_provisioning.sql` reads them to
 * create the matching `public.users` row.
 *
 * Role is intentionally not accepted from the form. Every signup lands on the
 * database default of `team_member`, and elevation is a deliberate act by a
 * managing director. Trusting a client-supplied role here would be a privilege
 * escalation hole.
 */
export async function signup(
  _prevState: AuthActionState | null,
  formData: FormData,
): Promise<AuthActionState> {
  const fullName = readString(formData, 'fullName');
  const employeeId = readString(formData, 'employeeId');
  const email = readString(formData, 'email');
  const password = readString(formData, 'password');

  if (!fullName) {
    return { success: false, error: 'Enter your full name.' };
  }
  if (!employeeId) {
    return { success: false, error: 'Enter your employee ID.' };
  }
  if (!isPlausibleEmail(email)) {
    return { success: false, error: 'Enter a valid email address.' };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      success: false,
      error: `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  const { headers } = await import('next/headers');
  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') || headerList.get('host');
  const protocol = headerList.get('x-forwarded-proto') || 'https';
  const siteUrl = host ? `${protocol}://${host}` : '';

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: siteUrl ? `${siteUrl}/auth/callback` : undefined,
      data: {
        full_name: fullName,
        employee_id: employeeId,
      },
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // With email confirmation enabled, signUp succeeds but issues no session.
  // Report that instead of redirecting into a guarded route that would bounce
  // straight back to /login.
  if (!data.session) {
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
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath('/', 'layout');
  redirect('/login');
}
