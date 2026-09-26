import { redirect } from 'next/navigation';

import { getAuthState } from '@/lib/auth/profile';

/**
 * Entry point. Sends provisioned users into the workspace and everyone else to
 * the login view. Checks for a profile rather than just a session so an
 * authenticated but unprovisioned account is not bounced into a guarded route.
 */
export default async function HomePage(): Promise<never> {
  const { profile } = await getAuthState();

  redirect(profile ? '/dashboard' : '/login');
}
