'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BellIcon, ChevronDownIcon } from 'lucide-react';

import { BrandMark } from '@/components/layout/brand-mark';
import { MORE_ITEMS, NAV_SECTIONS, activeSection, isMoreActive } from '@/components/layout/nav-items';
import { TimerPill } from '@/components/layout/timer-pill';
import { UserMenu } from '@/components/layout/user-menu';
import { QuickLogTrigger } from '@/modules/time-tracking/components/quick-log-trigger';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import type { RunningTimer } from '@/modules/time-tracking/client';
import { cn } from '@/shared/utils';
import type { User } from '@/types/tracker';

/**
 * Sticky workspace top bar. Desktop/tablet: brand, the five destination pills
 * and More, then the running-timer pill, Log hours, notifications and account.
 * Phones: brand, timer pill and account; destinations move to the bottom bar
 * and Log hours to its own floating action.
 */
export function TopBar({ profile, timers }: { profile: User; timers: readonly RunningTimer[] }) {
  const pathname = usePathname();
  const section = activeSection(pathname);
  const moreActive = isMoreActive(pathname);
  return (
    <header className="border-border sticky top-0 z-30 border-b bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="flex h-(--spacing-header) items-center gap-3 px-4 lg:px-6">
        <Link href="/today" className="flex shrink-0 items-center gap-2" aria-label="TaskPulse home">
          <BrandMark />
          {/* Wordmark hidden only at tablet width, where the destination pills need the room. */}
          <span className="text-foreground text-base font-bold tracking-tight md:max-lg:hidden">TaskPulse</span>
        </Link>

        <nav aria-label="Primary" className="bg-muted ml-2 hidden items-center gap-0.5 rounded-full p-1 md:flex">
          {NAV_SECTIONS.map(({ label, href }) => {
            const active = section?.href === href;
            return (
              <Link key={href} href={href} aria-current={active ? 'page' : undefined}
                className={cn('nav-pill', active && 'nav-pill-active')}>
                {label}
              </Link>
            );
          })}
          <DropdownMenu>
            <DropdownMenuTrigger className={cn('nav-pill', moreActive && 'nav-pill-active')}>
              More
              <ChevronDownIcon className="size-3.5" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} className="w-48">
              {MORE_ITEMS.map(({ label, href, icon: Icon }) => (
                <DropdownMenuItem key={href} asChild>
                  <Link href={href}>
                    <Icon aria-hidden="true" />
                    {label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="lg:hidden"><TimerPill timers={timers} compact /></span>
          <span className="hidden lg:inline-flex"><TimerPill timers={timers} /></span>
          <QuickLogTrigger
            variant="button"
            label="Log hours"
            className="bg-primary-subtle text-primary-subtle-foreground hover:bg-primary/15 hidden rounded-full border-0 font-semibold md:inline-flex"
          />
          <button type="button" className="icon-button hidden md:flex" aria-label="Notifications">
            <BellIcon className="size-4" aria-hidden="true" />
          </button>
          <UserMenu profile={profile} variant="bar" />
        </div>
      </div>
    </header>
  );
}
