'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { UserMenu } from '@/components/layout/user-menu';
import { isNavItemActive, NAV_ITEMS } from '@/components/layout/nav-items';
import { cn } from '@/lib/utils';
import type { User } from '@/types/tracker';

export interface NavRailProps {
  profile: User;
}

/**
 * Permanent icon rail.
 *
 * Always collapsed by design. Full labels live in the drawer, which the header's
 * menu button opens over the content — so the rail never reflows the page and the
 * grid keeps its width at every viewport.
 *
 * Each target carries a `title` for the native tooltip and a visually hidden
 * label, because an icon alone names nothing to a screen reader.
 *
 * The initials trigger at the foot of the rail is the only route to the account
 * menu. There is deliberately no second sign-out control anywhere in the shell.
 */
export function NavRail({ profile }: NavRailProps) {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Workspace navigation"
      className="border-border bg-card fixed inset-y-0 left-0 z-30 hidden w-14 flex-col items-center border-r py-3 md:flex"
    >
      {/* Brand mark. Doubles as the route home. */}
      <Link
        href="/dashboard"
        title="TaskPulse"
        className="bg-primary text-primary-foreground focus-visible:ring-primary/30 flex size-8 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold focus-visible:ring-2 focus-visible:outline-none"
      >
        TP
        <span className="sr-only">TaskPulse dashboard</span>
      </Link>

      <nav className="mt-4 flex flex-1 flex-col items-center gap-1">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const active = isNavItemActive(pathname, href);

          return (
            <Link
              key={href}
              href={href}
              title={label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rail-item',
                active && 'rail-item-active',
                'focus-visible:ring-primary/30 focus-visible:ring-2 focus-visible:outline-none',
              )}
            >
              <Icon className="size-[18px]" aria-hidden="true" />
              <span className="sr-only">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Account menu. The only access point. */}
      <UserMenu profile={profile} />
    </aside>
  );
}
