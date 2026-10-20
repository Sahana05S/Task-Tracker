// PRIVATE. Supabase Auth calls. Each returns an error message or the outcome.
import { createClient } from '@/shared/supabase/server';

import type { LoginInput, SignupInput } from './input';

/** Signs in with email and password; returns a user-facing error, or null. */
export async function signInWithPassword(
  input: Pick<LoginInput, 'email' | 'password'>,
): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (!error) return null;
  if (error.message.toLowerCase().includes('email not confirmed')) {
    return 'Please verify your email address before signing in. Check your inbox for the confirmation link.';
  }
  return error.message;
}

export type SignupOutcome =
  | { ok: false; error: string }
  | { ok: true; hasSession: boolean };

/**
 * Registers a new account.
 *
 * `full_name` and `employee_id` travel as auth metadata; the
 * `handle_new_user` trigger from `02_auth_provisioning.sql` reads them to
 * create the matching `public.users` row.
 */
export async function signUpAccount(input: SignupInput): Promise<SignupOutcome> {
  const siteUrl = await readSiteUrl();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: siteUrl ? `${siteUrl}/auth/callback` : undefined,
      data: {
        full_name: input.fullName,
        employee_id: input.employeeId,
      },
    },
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, hasSession: Boolean(data.session) };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

/** Exchanges an email-link or OAuth `code` for a session; true on success. */
export async function exchangeCodeForSession(code: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return !error;
}

/**
 * Asks Supabase Auth to email a recovery link that returns to /reset-password.
 * Returns Supabase's error message, or null. Supabase itself answers the same
 * way for unknown addresses; callers must still not show this to the visitor.
 */
export async function requestPasswordReset(email: string): Promise<string | null> {
  const siteUrl = await readSiteUrl();

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: siteUrl ? `${siteUrl}/reset-password` : undefined,
  });
  return error ? error.message : null;
}

/** Verifies a recovery `token_hash` (custom email template); true on success. */
export async function verifyRecoveryToken(tokenHash: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
  return !error;
}

/** Sets the signed-in user's password; returns a user-facing error, or null. */
export async function updatePassword(newPassword: string): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return error ? error.message : null;
}

/** The public origin of the current request, or '' when the host is unknown. */
async function readSiteUrl(): Promise<string> {
  const { headers } = await import('next/headers');
  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') || headerList.get('host');
  const protocol = headerList.get('x-forwarded-proto') || 'https';
  return host ? `${protocol}://${host}` : '';
}
