import * as React from 'react';

import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';
import { NavDrawer } from '@/components/layout/nav-drawer';
import { NavDrawerProvider } from '@/components/layout/nav-drawer-context';
import { SectionTabs } from '@/components/layout/section-tabs';
import { TopBar } from '@/components/layout/top-bar';
import type { NavCounts } from '@/lib/layout/nav-counts';
import type { RunningTimer } from '@/modules/time-tracking/client';
import type { User } from '@/types/tracker';

export interface AppShellProps {
  /** The signed-in user's profile, resolved by the guarded layout. */
  profile: User;
  /** Badge tallies for the More sheet. */
  counts: NavCounts;
  /** The user's running timers, for the top-bar pill. */
  timers: readonly RunningTimer[];
  children: React.ReactNode;
}

/**
 * Workspace chrome (redesign): a sticky top bar with the five destinations and
 * More, section tabs for grouped destinations, and on phones a four-tab bottom
 * bar, a separate "Log hours" action and a More sheet. Each page still renders
 * its own `WorkspaceHeader` title row and actions.
 */
export function AppShell({ profile, counts, timers, children }: AppShellProps) {
  return (
    <NavDrawerProvider>
      <div className="bg-background min-h-dvh">
        <TopBar profile={profile} timers={timers} />
        <SectionTabs />
        <main className="pb-36 md:pb-0">{children}</main>
        <MobileBottomNav />
        <NavDrawer counts={counts} profile={profile} />
      </div>
    </NavDrawerProvider>
  );
}
