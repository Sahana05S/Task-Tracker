// PRIVATE. Parses and validates the login and signup forms.
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
  fullName: string;
  employeeId: string;
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
 * Role is intentionally not read from the form. Every signup lands on the
 * database default of `team_member`, and elevation is a deliberate act by a
 * managing director. Trusting a client-supplied role here would be a privilege
 * escalation hole.
 */
export function parseSignupInput(formData: FormData): Parsed<SignupInput> {
  const fullName = readString(formData, 'fullName');
  const employeeId = readString(formData, 'employeeId');
  const email = readString(formData, 'email');
  const password = readString(formData, 'password');

  if (!fullName) {
    return { ok: false, error: 'Enter your full name.' };
  }
  if (!employeeId) {
    return { ok: false, error: 'Enter your employee ID.' };
  }
  if (!isPlausibleEmail(email)) {
    return { ok: false, error: 'Enter a valid email address.' };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  return { ok: true, value: { fullName, employeeId, email, password } };
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
