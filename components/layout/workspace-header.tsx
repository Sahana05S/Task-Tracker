'use client';

import { usePathname } from 'next/navigation';
import { GaugeIcon } from 'lucide-react';

import { UserMenu } from '@/components/layout/user-menu';
import { isNavItemActive, NAV_ITEMS } from '@/components/layout/nav-items';
import type { User } from '@/types/tracker';

export interface WorkspaceHeaderProps {
  profile: User;
}

/**
 * Sticky workspace header.
 *
 * Below 768px it carries the branding and the account menu, since the sidebar
 * that normally holds both is hidden. From 768px up it shows the active section
 * title and the account menu moves into the sidebar, so it is not duplicated.
 */
export function WorkspaceHeader({ profile }: WorkspaceHeaderProps) {
  const pathname = usePathname();
  const active = NAV_ITEMS.find((item) => isNavItemActive(pathname, item.href));

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
      {/* Mobile: branding */}
      <div className="flex items-center gap-2 md:hidden">
        <span className="flex size-7 items-center justify-center rounded-md bg-slate-900 text-slate-50">
          <GaugeIcon className="size-4" aria-hidden="true" />
        </span>
        <span className="text-sm font-semibold text-slate-900">TaskPulse</span>
      </div>

      {/* Tablet and desktop: active section */}
      <div className="hidden min-w-0 md:block">
        <h1 className="truncate text-sm font-semibold text-slate-900">
          {active?.label ?? 'Workspace'}
        </h1>
      </div>

      {/* Mobile only: the sidebar owns the profile at larger sizes. */}
      <div className="md:hidden">
        <UserMenu profile={profile} variant="compact" />
      </div>
    </header>
  );
}
