import * as React from 'react';

import { AppShell } from '@/modules/workspace-views/components/shell/app-shell';
import { requireProfile } from '@/shared/session/profile';
import { getNavCounts } from '@/modules/workspace-views';
import { getRunningTimers } from '@/modules/time-tracking';
import { RunningTimerProvider } from '@/modules/time-tracking/components/running-timer-context';
import { getShellCompanySettings, shellCategoryCatalogue } from '@/modules/settings';
import { CompanySettingsProvider } from '@/modules/settings/components/company-settings-context';
import { MissionStartToaster } from '@/modules/tasks/components/mission-status-prompt';
import { NativeBridge } from '@/modules/mobile/components/native-bridge';
import { DisclosureFocus } from '@/shared/ui/disclosure-focus';
import { Splash } from '@/shared/ui/splash';
import { SPLASH_SCRIPT } from '@/shared/ui/splash-script';

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
    shellCategoryCatalogue(),
    getShellCompanySettings(),
  ]);

  return (
    <CompanySettingsProvider catalogue={catalogue} meetingTypes={settings.meetingTypes} defaultScaleMode={settings.defaultScaleMode} branding={settings.branding}>
      {/* Decides before the overlay paints whether the splash plays (once per sign-in, never for tests or reduced motion). */}
      <script dangerouslySetInnerHTML={{ __html: SPLASH_SCRIPT }} />
      <Splash companyName={settings.branding?.companyName} />
      <RunningTimerProvider timers={timers}>
        <AppShell profile={profile} counts={counts}>
          {children}
          <MissionStartToaster />
          <DisclosureFocus />
          {/* Android app only: push registration, notification taps, back button, status bar. */}
          <NativeBridge />
        </AppShell>
      </RunningTimerProvider>
    </CompanySettingsProvider>
  );
}
