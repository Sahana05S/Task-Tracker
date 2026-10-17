import * as React from 'react';

import { AppShell } from '@/components/layout/app-shell';
import { requireProfile } from '@/shared/session/profile';
import { getNavCounts } from '@/lib/layout/nav-counts';
import { getRunningTimers } from '@/lib/layout/running-timers';

/**
 * Guarded layout for every workspace route.
 *
 * `proxy.ts` already turns anonymous requests away at the edge. This is the second
 * gate, and the one that matters for correctness: it proves a `public.users`
 * profile exists before any page renders, and it is what supplies the profile to
 * the shell.
 *
 * Keeping the check here as well as in the proxy means a route added later is
 * protected even if the proxy matcher is not updated.
 */
export default async function WorkspaceLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const profile = await requireProfile();
  const [counts, timers] = await Promise.all([getNavCounts(profile.id), getRunningTimers(profile.id)]);

  return (
    <AppShell profile={profile} counts={counts} timers={timers}>
      {children}
    </AppShell>
  );
}
