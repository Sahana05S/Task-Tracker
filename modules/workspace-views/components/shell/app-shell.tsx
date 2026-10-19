import * as React from 'react';

import { BeaverCompanion } from '@/modules/workspace-views/components/shell/beaver-companion';
import { MobileBottomNav } from '@/modules/workspace-views/components/shell/mobile-bottom-nav';
import { NavDrawer } from '@/modules/workspace-views/components/shell/nav-drawer';
import { NavDrawerProvider } from '@/modules/workspace-views/components/shell/nav-drawer-context';
import { SectionTabs } from '@/modules/workspace-views/components/shell/section-tabs';
import { TopBar } from '@/modules/workspace-views/components/shell/top-bar';
import type { NavCounts } from '@/modules/workspace-views/internal/nav-counts';
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
        <main>{children}</main>
        <footer className="mx-auto flex min-h-24 w-full max-w-[1200px] justify-end px-4 pb-36 pt-3 md:pb-6 lg:px-6">
          <BeaverCompanion state={timers.length ? 'focused' : 'neutral'} message={timers.length ? 'Your timer is running. One step at a time.' : 'One small step moves your mission forward.'} />
        </footer>
        <MobileBottomNav />
        <NavDrawer counts={counts} profile={profile} />
      </div>
    </NavDrawerProvider>
  );
}
