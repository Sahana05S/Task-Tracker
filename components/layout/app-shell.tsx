import * as React from 'react';

import { DesktopSidebar } from '@/components/layout/desktop-sidebar';
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import type { User } from '@/types/tracker';

export interface AppShellProps {
  /** The signed-in user's profile, resolved by the guarded layout. */
  profile: User;
  children: React.ReactNode;
}

/**
 * Global workspace chrome.
 *
 * A Server Component: it receives an already-resolved profile and renders the
 * three navigation surfaces, each of which is a Client Component because it
 * needs `usePathname` for active state.
 *
 * Responsive behaviour:
 *
 *   < 768px         header with branding, sticky bottom bar with the Log Hours FAB
 *   768px - 1024px  5rem icon rail with tooltips, no bottom bar
 *   > 1024px        full sidebar with grouped sections and the profile block
 *
 * The content column is offset by the rail width at each breakpoint, and gains
 * bottom padding on mobile so the last row clears the fixed bar. Both the sidebar
 * and the page sit directly on the warm field: separation comes from the cards'
 * elevation rather than from a divider.
 */
export function AppShell({ profile, children }: AppShellProps) {
  return (
    <div className="bg-background min-h-dvh">
      <DesktopSidebar profile={profile} />

      <div className="flex min-h-dvh flex-col md:pl-20 lg:pl-(--spacing-sidebar)">
        <WorkspaceHeader profile={profile} />

        <main className="flex-1 px-4 pb-28 md:pb-8 lg:px-6">{children}</main>
      </div>

      <MobileBottomNav />
    </div>
  );
}
