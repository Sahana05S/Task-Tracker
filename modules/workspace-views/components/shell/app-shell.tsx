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
  /** The user's running timers, for the companion's message (the pill reads `RunningTimerProvider`). */
  timers: readonly RunningTimer[];
  children: React.ReactNode;
}

/**
 * Workspace chrome (redesign): a sticky top bar with the five destinations and
 * More, section tabs for grouped destinations, and on phones a four-tab bottom
 * bar, a "New" menu (Log time, Post) and a More sheet. Each page still renders
 * its own `MissionPageHeader` title row and actions.
 */
export function AppShell({ profile, counts, timers, children }: AppShellProps) {
  return (
    <NavDrawerProvider>
      <div className="bg-background min-h-dvh">
        <a href="#main" className="bg-primary text-primary-foreground sr-only z-50 rounded-lg px-4 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
          Skip to content
        </a>
        <TopBar profile={profile} />
        <SectionTabs />
        <main id="main" tabIndex={-1} className="outline-none">{children}</main>
        <footer className="mx-auto flex min-h-24 w-full max-w-[1200px] justify-end px-4 pt-3 pb-36 md:pb-6 lg:px-6 [body:has([data-page-width=wide])_&]:max-w-[1440px]">
          <BeaverCompanion state={timers.length ? 'focused' : 'neutral'} message={timers.length ? 'Your timer is running. One step at a time.' : 'One small step moves your mission forward.'} />
        </footer>
        <MobileBottomNav />
        <NavDrawer counts={counts} profile={profile} />
      </div>
    </NavDrawerProvider>
  );
}
