'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useNavDrawer } from '@/components/layout/nav-drawer-context';
import { isNavItemActive, NAV_ITEMS } from '@/components/layout/nav-items';
import { UserMenu } from '@/components/layout/user-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { NavCounts } from '@/lib/layout/nav-counts';
import { cn } from '@/lib/utils';
import type { User } from '@/types/tracker';

export interface NavDrawerProps {
  counts: NavCounts;
  /** Needed for the account row shown where the rail is hidden. */
  profile: User;
}

/**
 * Expanded navigation.
 *
 * Slides in over the content rather than pushing it, so opening the drawer never
 * reflows the grid behind it. The rail stays put underneath; this is the same
 * destinations with their labels and tallies attached.
 *
 * Counts come from the guarded layout as `head: true` exact counts, so the badges
 * cost a tally rather than a payload.
 *
 * The account row in the footer is `md:hidden` on purpose. The rail carries the
 * account menu from 768px up; below that the rail is hidden, and without this row
 * a phone would have no route to Settings or Sign Out at all. Gating it keeps
 * exactly one access point per viewport rather than two on the desktop.
 */
export function NavDrawer({ counts, profile }: NavDrawerProps) {
  const pathname = usePathname();
  const { open, setOpen } = useNavDrawer();

  const badgeFor = (href: string): number | null => {
    switch (href) {
      case '/tasks':
        return counts.openTasks;
      case '/logs':
        return counts.myLogsThisMonth;
      case '/milestones':
        return counts.openMilestones;
      // Dashboard has no meaningful tally.
      default:
        return null;
    }
  };

  const captionFor = (href: string): string | null => {
    switch (href) {
      case '/tasks':
        return 'open across the team';
      case '/logs':
        return 'entries this month';
      case '/milestones':
        return 'still in progress';
      default:
        return null;
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="w-72 gap-0 sm:max-w-72">
        <SheetHeader>
          <SheetTitle>TaskPulse</SheetTitle>
          <SheetDescription>Multi-metric performance tracker</SheetDescription>
        </SheetHeader>

        <nav aria-label="Workspace sections" className="flex flex-col gap-1 p-3">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const active = isNavItemActive(pathname, href);
            const badge = badgeFor(href);
            const caption = captionFor(href);

            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'nav-item',
                  active && 'nav-item-active',
                  'focus-visible:ring-primary/30 focus-visible:ring-2 focus-visible:outline-none',
                )}
              >
                <Icon className="size-[18px] shrink-0" aria-hidden="true" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{label}</span>
                  {caption && badge !== null ? (
                    <span className="text-muted-foreground text-[11px] font-normal">
                      {caption}
                    </span>
                  ) : null}
                </span>
                {badge !== null ? (
                  // Announced together with the caption above, so the number is
                  // never read out on its own.
                  <span className="nav-count" aria-hidden="true">
                    {badge}
                  </span>
                ) : null}
                {badge !== null && caption ? (
                  <span className="sr-only">
                    {badge} {caption}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <SheetFooter className="border-border border-t px-2 py-2 md:hidden">
          <UserMenu profile={profile} variant="row" />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
