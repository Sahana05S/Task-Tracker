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
 * Responsive behaviour, matching `responsive-ui-design.md`:
 *
 *   < 768px         header with branding, sticky bottom bar with the Log Hours FAB
 *   768px - 1024px  4rem icon rail with tooltips, no bottom bar
 *   > 1024px        full 16rem sidebar with labels and the profile block
 *
 * The content column is offset by the rail width at each breakpoint, and gains
 * bottom padding on mobile so the last row clears the fixed bar.
 */
export function AppShell({ profile, children }: AppShellProps) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <DesktopSidebar profile={profile} />

      <div className="flex min-h-dvh flex-col md:pl-16 lg:pl-64">
        <WorkspaceHeader profile={profile} />

        <main className="flex-1 px-4 py-6 pb-24 md:pb-6 lg:px-6">
          {children}
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}
