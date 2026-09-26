'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GaugeIcon, LogOutIcon } from 'lucide-react';

import { logout } from '@/app/auth/actions';
import { UserMenu } from '@/components/layout/user-menu';
import {
  isNavItemActive,
  NAV_ITEMS,
  NAV_SECTIONS,
} from '@/components/layout/nav-items';
import { cn } from '@/lib/utils';
import type { User } from '@/types/tracker';

export interface DesktopSidebarProps {
  profile: User;
}

/**
 * Permanent left navigation.
 *
 * Hidden below 768px, where the bottom bar takes over. Between 768px and 1024px
 * it collapses to an icon rail; from 1024px it expands to the full sidebar with
 * labels and grouped sections.
 *
 * The active row is marked three ways at once — forest text, bold weight, and a
 * rounded indicator bar at the left edge — so the state survives a colourblind
 * reading and remains legible in the collapsed rail where the label is hidden.
 */
export function DesktopSidebar({ profile }: DesktopSidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Workspace navigation"
      className={cn(
        'fixed inset-y-0 left-0 z-30 hidden flex-col bg-sidebar',
        'md:flex md:w-20 lg:w-(--spacing-sidebar)',
      )}
    >
      {/* Branding */}
      <div className="flex h-(--spacing-header) shrink-0 items-center gap-2.5 px-4 lg:px-6">
        <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-xl">
          <GaugeIcon className="size-5" aria-hidden="true" />
        </span>
        <span className="hidden min-w-0 flex-col lg:flex">
          <span className="text-foreground truncate text-base font-bold tracking-tight">
            TaskPulse
          </span>
        </span>
      </div>

      {/* Navigation, grouped into sections */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 lg:px-4">
        {NAV_SECTIONS.map((section) => {
          const items = NAV_ITEMS.filter((item) => item.section === section.id);

          return (
            <div key={section.id}>
              {/* Heading is hidden in the collapsed rail, where there is no room
                  for it, but stays available to assistive technology. */}
              <p
                className={cn(
                  'nav-section-label',
                  'sr-only lg:not-sr-only lg:block',
                )}
              >
                {section.label}
              </p>

              <ul className="flex flex-col gap-1">
                {items.map(({ label, href, icon: Icon }) => {
                  const active = isNavItemActive(pathname, href);

                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        // Native tooltip for the collapsed rail, where the label
                        // is visually hidden.
                        title={label}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'nav-item',
                          active && 'nav-item-active',
                          'md:justify-center lg:justify-start',
                        )}
                      >
                        <Icon className="size-5 shrink-0" aria-hidden="true" />
                        <span className="hidden lg:inline">{label}</span>
                        <span className="sr-only lg:hidden">{label}</span>
                      </Link>
                    </li>
                  );
                })}

                {/* Sign out closes the General section. Rendered as a form so the
                    Server Action runs without any client handler. */}
                {section.id === 'general' ? (
                  <li>
                    <form action={logout}>
                      <button
                        type="submit"
                        title="Sign out"
                        className={cn(
                          'nav-item w-full',
                          'md:justify-center lg:justify-start',
                        )}
                      >
                        <LogOutIcon
                          className="size-5 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="hidden lg:inline">Sign out</span>
                        <span className="sr-only lg:hidden">Sign out</span>
                      </button>
                    </form>
                  </li>
                ) : null}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Profile */}
      <div className="shrink-0 p-3 lg:p-4">
        <UserMenu profile={profile} variant="expanded" />
      </div>
    </aside>
  );
}
