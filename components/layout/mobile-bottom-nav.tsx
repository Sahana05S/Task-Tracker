'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { QuickLogSheet } from '@/components/layout/quick-log-sheet';
import { isNavItemActive, NAV_ITEMS } from '@/components/layout/nav-items';
import { cn } from '@/lib/utils';

/**
 * Sticky mobile bottom bar, hidden from 768px upwards where the sidebar rail
 * takes over.
 *
 * Slot order follows `responsive-ui-design.md`:
 * Dashboard | Tasks | Log Hours (+) | Milestones, with the action button
 * centred and raised above the bar.
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const destinations = NAV_ITEMS.filter((item) => item.inBottomNav);

  // The action button occupies the centre slot.
  const midpoint = Math.ceil(destinations.length / 2);
  const leading = destinations.slice(0, midpoint);
  const trailing = destinations.slice(midpoint);

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white md:hidden',
        // Clears the iOS home indicator.
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <ul className="flex h-16 items-stretch justify-around">
        {leading.map((item) => (
          <BottomNavLink key={item.href} pathname={pathname} {...item} />
        ))}

        <li className="flex items-center justify-center">
          <QuickLogSheet />
        </li>

        {trailing.map((item) => (
          <BottomNavLink key={item.href} pathname={pathname} {...item} />
        ))}
      </ul>
    </nav>
  );
}

interface BottomNavLinkProps {
  pathname: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

function BottomNavLink({
  pathname,
  label,
  href,
  icon: Icon,
}: BottomNavLinkProps) {
  const active = isNavItemActive(pathname, href);

  return (
    <li className="flex flex-1">
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors',
          'focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:outline-none',
          active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700',
        )}
      >
        <Icon className="size-5" />
        {label}
      </Link>
    </li>
  );
}
