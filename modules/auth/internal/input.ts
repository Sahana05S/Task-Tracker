// PRIVATE. Parses and validates the login, signup and password-reset forms.
import { readString } from '@/shared/forms/form-data';

import { safeRedirectPath } from './redirects';
import type { Parsed } from './types';

const MIN_PASSWORD_LENGTH = 8;

export interface LoginInput {
  email: string;
  password: string;
  redirectTo: string;
}

export interface SignupInput {
  email: string;
  password: string;
}

export function parseLoginInput(formData: FormData): Parsed<LoginInput> {
  const email = readString(formData, 'email');
  const password = readString(formData, 'password');
  const redirectTo = safeRedirectPath(readString(formData, 'redirectTo'));

  if (!email || !password) {
    return { ok: false, error: 'Enter both your email and password.' };
  }
  return { ok: true, value: { email, password, redirectTo } };
}

/**
 * Accepting an invitation needs only the invited email and a password. Name,
 * employee ID, role and company come from the director's invitation in the
 * database (migration 49); nothing the visitor types can grant access.
 */
export function parseSignupInput(formData: FormData): Parsed<SignupInput> {
  const email = readString(formData, 'email');
  const password = readString(formData, 'password');

  if (!isPlausibleEmail(email)) {
    return { ok: false, error: 'Enter a valid email address.' };
  }
  const passwordError = passwordProblem(password);
  if (passwordError) return { ok: false, error: passwordError };
  return { ok: true, value: { email, password } };
}

export function parseResetRequestInput(formData: FormData): Parsed<{ email: string }> {
  const email = readString(formData, 'email');
  if (!isPlausibleEmail(email)) {
    return { ok: false, error: 'Enter a valid email address.' };
  }
  return { ok: true, value: { email } };
}

/** The new password from the reset form, held to the same rule as signup. */
export function parseNewPasswordInput(formData: FormData): Parsed<{ password: string }> {
  const password = readString(formData, 'password');
  const confirmPassword = readString(formData, 'confirmPassword');

  const passwordError = passwordProblem(password);
  if (passwordError) return { ok: false, error: passwordError };
  if (password !== confirmPassword) {
    return { ok: false, error: 'The two passwords do not match.' };
  }
  return { ok: true, value: { password } };
}

function passwordProblem(password: string): string | null {
  return password.length < MIN_PASSWORD_LENGTH
    ? `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`
    : null;
}

function isPlausibleEmail(email: string): boolean {
  // Deliberately permissive. Supabase performs the authoritative check; this
  // only catches obvious typos before spending a network round trip.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Resolves the `?tab=` parameter to a pane.
 *
 * `signup` and `signin` are the values the landing page links use. Anything else,
 * including an absent parameter, falls back to sign-in — the right default for a
 * returning member and for a visitor arriving from the route guard.
 */
export function resolveInitialMode(tab: string | undefined): 'login' | 'signup' {
  return tab === 'signup' ? 'signup' : 'login';
}
