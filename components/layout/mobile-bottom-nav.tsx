'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MoreHorizontalIcon, PlusIcon } from 'lucide-react';
import * as React from 'react';

import { useNavDrawer } from '@/components/layout/nav-drawer-context';
import { NAV_SECTIONS, activeSection } from '@/components/layout/nav-items';
import { QuickLogDrawer } from '@/modules/time-tracking/components/quick-log-drawer';
import { cn } from '@/shared/utils';

/**
 * Phone navigation (below 768px): Today, Missions, Team and More as tabs.
 * Log hours is deliberately not a tab: it is a labelled floating action above
 * the bar, so it reads as "do something" rather than "go somewhere". More opens
 * the full destination sheet (Records, Reports, Company, Settings and every
 * section tab).
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const section = activeSection(pathname);
  const { open, setOpen } = useNavDrawer();
  const [logOpen, setLogOpen] = React.useState(false);
  const tabs = NAV_SECTIONS.filter((item) => item.inBottomNav);
  const inMore = section ? !section.inBottomNav : true;

  return (
    <>
      <button
        type="button"
        onClick={() => setLogOpen(true)}
        className="bg-primary text-primary-foreground hover:bg-primary-hover fixed right-4 z-30 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold shadow-(--shadow-soft-lg) md:hidden"
        style={{ bottom: 'calc(var(--spacing-bottom-nav) + 0.75rem + env(safe-area-inset-bottom))' }}
      >
        <PlusIcon className="size-4" aria-hidden="true" />
        Log hours
      </button>
      {logOpen ? <QuickLogDrawer open={logOpen} onOpenChange={setLogOpen} /> : null}

      <nav
        aria-label="Primary"
        className="border-border fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="flex h-(--spacing-bottom-nav) items-stretch justify-around px-2">
          {tabs.map(({ label, href, icon: Icon }) => {
            const active = section?.href === href;
            return (
              <li key={href} className="flex flex-1">
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                    active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span className={cn('flex h-7 w-12 items-center justify-center rounded-full', active && 'bg-primary-subtle')}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
          <li className="flex flex-1">
            <button
              type="button"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                inMore || open ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span className={cn('flex h-7 w-12 items-center justify-center rounded-full', (inMore || open) && 'bg-primary-subtle')}>
                <MoreHorizontalIcon className="size-5" aria-hidden="true" />
              </span>
              More
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
