'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useNavDrawer } from '@/modules/workspace-views/components/shell/nav-drawer-context';
import { MORE_ITEMS, NAV_SECTIONS, isTabActive, type NavTab } from '@/modules/workspace-views/components/shell/nav-items';
import { UserMenu } from '@/modules/workspace-views/components/shell/user-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet';
import type { NavCounts } from '@/modules/workspace-views/internal/nav-counts';
import { cn } from '@/shared/utils';
import type { User } from '@/types/tracker';

export interface NavDrawerProps {
  counts: NavCounts;
  profile: User;
}

/**
 * The phone "More" sheet: every destination, grouped exactly as the desktop top
 * bar and section tabs, so nothing reachable on desktop is missing on a phone.
 * Count badges are unchanged from the previous drawer.
 */
export function NavDrawer({ counts, profile }: NavDrawerProps) {
  const pathname = usePathname();
  const { open, setOpen } = useNavDrawer();

  const badge = (href: string): { value: number; caption: string } | null => {
    switch (href) {
      case '/tasks':
        return { value: counts.openTasks, caption: 'open across the team' };
      case '/logs':
        return { value: counts.myLogsThisMonth, caption: 'entries this month' };
      case '/milestones':
        return { value: counts.openMilestones, caption: 'still in progress' };
      default:
        return null;
    }
  };

  const row = (tab: NavTab) => {
    const active = isTabActive(pathname, tab);
    const count = badge(tab.href);
    const Icon = tab.icon;
    return (
      <Link
        key={tab.href}
        href={tab.href}
        onClick={() => setOpen(false)}
        aria-current={active ? 'page' : undefined}
        className={cn('nav-item', active && 'nav-item-active', 'focus-visible:ring-primary/30 focus-visible:ring-2 focus-visible:outline-none')}
      >
        <Icon className="size-[18px] shrink-0" aria-hidden="true" />
        <span className="truncate">{tab.label}</span>
        {count ? (
          <>
            <span className="nav-count" aria-hidden="true">{count.value}</span>
            <span className="sr-only">{count.value} {count.caption}</span>
          </>
        ) : null}
      </Link>
    );
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="bottom" className="max-h-[85dvh] gap-0 rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>All destinations</SheetTitle>
          <SheetDescription>Missions, records, team, reports and more</SheetDescription>
        </SheetHeader>
        <nav aria-label="All destinations" className="grid gap-4 overflow-y-auto px-3 pb-3">
          {NAV_SECTIONS.map((section) => (
            <section key={section.href} className="grid gap-1">
              <h2 className="eyebrow px-3">{section.label}</h2>
              {section.tabs.map(row)}
            </section>
          ))}
          <section className="grid gap-1">
            <h2 className="eyebrow px-3">More</h2>
            {MORE_ITEMS.map(row)}
          </section>
        </nav>
        <SheetFooter className="border-border border-t px-2 py-2">
          <UserMenu profile={profile} variant="row" />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
