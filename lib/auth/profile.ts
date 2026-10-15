import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { mapUser, USER_COLUMNS } from '@/lib/supabase/mappers';
import type { User, UserRole } from '@/types/tracker';

/**
 * Server-side profile access. Import only from Server Components, Server
 * Actions, or Route Handlers.
 */

export interface AuthState {
  /** `auth.users.id` of the verified caller, or `null` when signed out. */
  authUserId: string | null;
  /** The caller's TaskPulse profile, or `null` if none is provisioned. */
  profile: User | null;
}

/**
 * Resolves the caller's auth identity and profile in one pass.
 *
 * Both halves are returned because "signed in" and "has a profile" are
 * genuinely different states. A user can authenticate successfully and still
 * have no `public.users` row if the provisioning trigger from
 * `02_auth_provisioning.sql` has not been applied. Callers that cannot tell
 * those two apart end up bouncing the user between `/login` and `/dashboard`
 * forever.
 *
 * Uses `auth.getUser()`, which validates the token against the Auth server,
 * rather than trusting a session decoded from cookies.
 */
export async function getAuthState(): Promise<AuthState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { authUserId: null, profile: null };
  }

  const { data, error } = await supabase
    .from('users')
    .select(USER_COLUMNS)
    .eq('id', user.id)
    .maybeSingle();

  return {
    authUserId: user.id,
    profile: error || !data ? null : mapUser(data),
  };
}

/** The signed-in user's profile, or `null` when unavailable. */
export async function getCurrentProfile(): Promise<User | null> {
  const { profile } = await getAuthState();
  return profile;
}

/**
 * Same as {@link getCurrentProfile} but redirects to `/login` instead of
 * returning `null`. Use in layouts and pages that must have a profile.
 *
 * `/login` renders an explanation when the caller is authenticated but has no
 * profile, so this redirect terminates rather than looping.
 */
export async function requireProfile(): Promise<User> {
  const profile = await getCurrentProfile();

  if (!profile || !profile.isActive) {
    redirect('/login');
  }

  return profile;
}

/**
 * Guards a page or action behind a set of roles, covering the role checks the
 * roadmap calls for in Phase 2.
 *
 * Runs in the server layer rather than in `proxy.ts` on purpose: resolving a
 * role needs a database read, and doing that in the proxy would add a query to
 * every matched request, including the ones that do not restrict by role.
 */
export async function requireRole(allowed: readonly UserRole[]): Promise<User> {
  const profile = await requireProfile();

  if (!allowed.includes(profile.role)) {
    redirect('/today');
  }

  return profile;
}
