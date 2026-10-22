'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClockPlusIcon, MessageSquarePlusIcon, MoreHorizontalIcon, PlusIcon } from 'lucide-react';
import * as React from 'react';

import { useNavDrawer } from '@/modules/workspace-views/components/shell/nav-drawer-context';
import { NAV_SECTIONS, activeSection } from '@/modules/workspace-views/components/shell/nav-items';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';
import { cn } from '@/shared/utils';

// Loaded on first use: most page views never open either drawer.
const QuickLogDrawer = dynamic(() => import('@/modules/time-tracking/components/quick-log-drawer').then((m) => m.QuickLogDrawer), { ssr: false });
const QuickPostDrawer = dynamic(() => import('@/modules/support/components/quick-post-drawer').then((m) => m.QuickPostDrawer), { ssr: false });

const QUICK_ACTIONS = [
  { key: 'log', label: 'Log time', hint: 'Hours worked on a mission', icon: ClockPlusIcon },
  { key: 'post', label: 'Post', hint: 'A fact, idea, suggestion, sale or meeting point', icon: MessageSquarePlusIcon },
] as const;

/**
 * Phone navigation (below 768px): Today, Missions, Team and More as tabs.
 * The quick actions are deliberately not tabs: a labelled floating "New"
 * button above the bar opens a two-item menu (Log time, Post), so it reads as
 * "do something" rather than "go somewhere". The chosen drawer is mounted only
 * while open. More opens the full destination sheet (Records, Reports,
 * Company, Settings and every section tab).
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const section = activeSection(pathname);
  const { open, setOpen } = useNavDrawer();
  const [drawer, setDrawer] = React.useState<'log' | 'post' | null>(null);
  const newButton = React.useRef<HTMLButtonElement>(null);
  // The menu item that opened the drawer is gone, so hand focus back to New.
  const closeDrawer = (next: boolean) => {
    if (next) return;
    setDrawer(null);
    requestAnimationFrame(() => newButton.current?.focus());
  };
  const tabs = NAV_SECTIONS.filter((item) => item.inBottomNav);
  const inMore = section ? !section.inBottomNav : true;

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          ref={newButton}
          className="bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:ring-ring fixed right-4 z-30 flex min-h-12 items-center gap-2 rounded-full px-5 text-sm font-semibold shadow-(--shadow-soft-lg) outline-none focus-visible:ring-2 focus-visible:ring-offset-2 md:hidden"
          style={{ bottom: 'calc(var(--spacing-bottom-nav) + 0.75rem + env(safe-area-inset-bottom))' }}
        >
          <PlusIcon className="size-4" aria-hidden="true" />
          New
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" sideOffset={8} className="w-64">
          {QUICK_ACTIONS.map(({ key, label, hint, icon: Icon }) => (
            <DropdownMenuItem key={key} onSelect={() => setDrawer(key)} className="min-h-12 gap-3">
              <Icon className="text-primary size-5" aria-hidden="true" />
              <span className="grid">
                <span className="font-semibold">{label}</span>
                <span className="text-muted-foreground text-xs">{hint}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {drawer === 'log' ? <QuickLogDrawer open onOpenChange={closeDrawer} /> : null}
      {drawer === 'post' ? <QuickPostDrawer open onOpenChange={closeDrawer} onPostAnother={() => setDrawer('post')} /> : null}

      <nav
        aria-label="Primary"
        className="border-border fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
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
