'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GaugeIcon } from 'lucide-react';

import { UserMenu } from '@/components/layout/user-menu';
import { isNavItemActive, NAV_ITEMS } from '@/components/layout/nav-items';
import { cn } from '@/lib/utils';
import type { User } from '@/types/tracker';

export interface DesktopSidebarProps {
  profile: User;
}

/**
 * Permanent left navigation.
 *
 * Hidden below 768px, where the bottom bar takes over. Between 768px and
 * 1024px it collapses to a 4rem icon rail with native tooltips; from 1024px it
 * expands to the full 16rem sidebar with labels, per the viewport rules in
 * `responsive-ui-design.md`.
 */
export function DesktopSidebar({ profile }: DesktopSidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Workspace navigation"
      className={cn(
        'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-slate-200 bg-white',
        'md:flex md:w-16 lg:w-64',
      )}
    >
      {/* Branding */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 px-3 lg:px-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-slate-900 text-slate-50">
          <GaugeIcon className="size-4" aria-hidden="true" />
        </span>
        <span className="hidden min-w-0 flex-col lg:flex">
          <span className="truncate text-sm font-semibold text-slate-900">
            TaskPulse
          </span>
          <span className="truncate text-xs text-slate-500">
            Performance Tracker
          </span>
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const active = isNavItemActive(pathname, href);

            return (
              <li key={href}>
                <Link
                  href={href}
                  // Native tooltip for the collapsed rail, where the label is
                  // visually hidden.
                  title={label}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    'md:justify-center lg:justify-start',
                    'focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:outline-none',
                    active
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="hidden lg:inline">{label}</span>
                  {/* Keeps the label available to assistive tech in icon-only mode. */}
                  <span className="sr-only lg:hidden">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Profile */}
      <div className="shrink-0 border-t border-slate-200 p-2">
        <UserMenu profile={profile} variant="expanded" />
      </div>
    </aside>
  );
}
