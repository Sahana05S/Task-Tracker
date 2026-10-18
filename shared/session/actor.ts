import { getCurrentProfile } from '@/shared/session/profile';
import type { User } from '@/types/tracker';

/**
 * The caller of a server action. Actions resolve it first so the UI gets a
 * clear message; the database RLS/RPC checks remain the real boundary.
 */
export type Actor =
  | { readonly ok: true; readonly profile: User }
  | { readonly ok: false; readonly error: string };

/** Resolves the signed-in, active caller of a server action. */
export async function resolveActor(): Promise<Actor> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'You are not signed in.' };
  if (!profile.isActive) return { ok: false, error: 'Your account is deactivated.' };
  return { ok: true, profile };
}
