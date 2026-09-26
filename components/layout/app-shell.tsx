import * as React from 'react';

import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';
import { NavDrawer } from '@/components/layout/nav-drawer';
import { NavDrawerProvider } from '@/components/layout/nav-drawer-context';
import { NavRail } from '@/components/layout/nav-rail';
import type { NavCounts } from '@/lib/layout/nav-counts';
import type { User } from '@/types/tracker';

export interface AppShellProps {
  /** The signed-in user's profile, resolved by the guarded layout. */
  profile: User;
  /** Badge tallies for the expanded drawer. */
  counts: NavCounts;
  children: React.ReactNode;
}

/**
 * Workspace chrome.
 *
 * Three surfaces and nothing else:
 *
 *   - a permanent 56px icon rail, always collapsed, with the account menu at its
 *     foot
 *   - an expanded drawer that slides over the content when the header's menu
 *     button is pressed
 *   - a sticky bottom bar below 768px, where a fixed rail would cost too much of
 *     a phone screen
 *
 * There is no shell-level header. Each page renders `WorkspaceHeader` with its own
 * title and actions, which is what lets page-specific controls sit beside the
 * global ones in a single row instead of stacking two bars.
 *
 * The rail never expands in place, so the content column keeps one width at every
 * viewport and the data grid never reflows.
 */
export function AppShell({ profile, counts, children }: AppShellProps) {
  return (
    <NavDrawerProvider>
      <div className="bg-background min-h-dvh">
        <NavRail profile={profile} />
        <NavDrawer counts={counts} />

        <div className="flex min-h-dvh flex-col md:pl-14">
          <main className="flex-1 pb-24 md:pb-0">{children}</main>
        </div>

        <MobileBottomNav />
      </div>
    </NavDrawerProvider>
  );
}
