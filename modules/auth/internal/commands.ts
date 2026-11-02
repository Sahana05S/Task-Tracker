// PRIVATE. Supabase Auth calls. Each returns an error message or the outcome.
import { createClient, createDetachedClient } from '@/shared/supabase/server';

import type { LoginInput, SignupInput } from './input';
import { publicOrigin } from '@/shared/security/origin';

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
 * Creates the auth account for an invited email. The `handle_new_user`
 * trigger (migration 49) applies the matching invitation; an address without
 * one gets an inactive profile with no company.
 */
export async function signUpAccount(input: SignupInput): Promise<SignupOutcome> {
  const siteUrl = await readSiteUrl();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: siteUrl ? `${siteUrl}/auth/callback` : undefined,
    },
  });

  // "Already registered" would tell a visitor which addresses have accounts.
  if (error) {
    if (/already (registered|exists)/i.test(error.message)) {
      return { ok: false, error: 'This email cannot be used to accept an invitation. If you already joined, sign in or reset your password.' };
    }
    return { ok: false, error: 'The invitation could not be accepted. Check the email and try again.' };
  }
  return { ok: true, hasSession: Boolean(data.session) };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

/** Exchanges an email-link `code` for a session; true on success. */
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

/** What opening an emailed link did to this browser's session. */
export type EmailTokenOutcome = 'verified' | 'failed' | 'other_account';

/**
 * Verifies an emailed `token_hash` link (recovery, or sign-up confirmation).
 * Unlike a PKCE `code`, it works in any browser, so a link opened from the
 * phone's mail app still signs the person in.
 *
 * A browser that is already signed in keeps its own session unless the link is
 * for that same person: otherwise anyone could send a colleague their own reset
 * link and have the colleague's browser quietly continue as them. The token is
 * checked on a client that stores nothing, and its session is adopted only on a
 * match; a link for another account is used up and its session ended.
 */
export async function verifyEmailToken(tokenHash: string, type: 'recovery' | 'email'): Promise<EmailTokenOutcome> {
  const supabase = await createClient();
  const { data: current } = await supabase.auth.getUser();
  if (!current.user) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    return error ? 'failed' : 'verified';
  }
  const detached = createDetachedClient();
  const { data, error } = await detached.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.session || !data.user) return 'failed';
  if (data.user.id !== current.user.id) {
    await detached.auth.signOut({ scope: 'local' }).catch(() => undefined);
    return 'other_account';
  }
  const { error: adoptError } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  return adoptError ? 'failed' : 'verified';
}

/** Sets the signed-in user's password; returns a user-facing error, or null. */
export async function updatePassword(newPassword: string): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return error ? error.message : null;
}

/** The site's public origin (configured, else this request's host), or '' when unknown. */
async function readSiteUrl(): Promise<string> {
  const { headers } = await import('next/headers');
  const headerList = await headers();
  return publicOrigin((name) => headerList.get(name));
}
