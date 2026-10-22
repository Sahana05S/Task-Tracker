import * as React from 'react';

import { AppShell } from '@/modules/workspace-views/components/shell/app-shell';
import { requireProfile } from '@/shared/session/profile';
import { getNavCounts } from '@/modules/workspace-views';
import { getRunningTimers } from '@/modules/time-tracking';
import { RunningTimerProvider } from '@/modules/time-tracking/components/running-timer-context';
import { categoryCatalogue, getCompanySettings } from '@/modules/settings';
import { CompanySettingsProvider } from '@/modules/settings/components/company-settings-context';

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
  const [counts, timers, catalogue, settings] = await Promise.all([
    getNavCounts(profile.id),
    getRunningTimers(profile.id),
    categoryCatalogue(),
    getCompanySettings(),
  ]);

  return (
    <CompanySettingsProvider catalogue={catalogue} meetingTypes={settings.meetingTypes}>
      <RunningTimerProvider timers={timers}>
        <AppShell profile={profile} counts={counts} timers={timers}>
          {children}
        </AppShell>
      </RunningTimerProvider>
    </CompanySettingsProvider>
  );
}
