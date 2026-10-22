'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BellIcon, ChevronDownIcon } from 'lucide-react';

import { BrandMark } from '@/modules/workspace-views/components/shell/brand-mark';
import { MORE_ITEMS, NAV_SECTIONS, activeSection, isMoreActive } from '@/modules/workspace-views/components/shell/nav-items';
import { TimerPill } from '@/modules/workspace-views/components/shell/timer-pill';
import { UserMenu } from '@/modules/workspace-views/components/shell/user-menu';
import { QuickLogTrigger } from '@/modules/time-tracking/components/quick-log-trigger';
import { QuickPostTrigger } from '@/modules/support/components/quick-post-trigger';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { cn } from '@/shared/utils';
import type { User } from '@/types/tracker';

/**
 * Sticky workspace top bar. Desktop/tablet: brand, the five destination pills
 * and More, then the running-timer pill, the two quick actions (Log time and
 * Post), notifications and account. Below 1280 px the timer pill is compact
 * and the quick actions show icons only, so the bar never overflows. Phones:
 * brand, timer pill and account; destinations move to the bottom bar and the
 * quick actions to its "New" menu.
 */
export function TopBar({ profile }: { profile: User }) {
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
          {NAV_SECTIONS.map(({ label, href, wideOnly }) => {
            const active = section?.href === href;
            return (
              <Link key={href} href={href} aria-current={active ? 'page' : undefined}
                className={cn('nav-pill', active && 'nav-pill-active', wideOnly && 'max-lg:hidden')}>
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
              {NAV_SECTIONS.filter((s) => s.wideOnly).map(({ label, href, icon: Icon }) => (
                <DropdownMenuItem key={href} asChild className="lg:hidden">
                  <Link href={href}>
                    <Icon aria-hidden="true" />
                    {label}
                  </Link>
                </DropdownMenuItem>
              ))}
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
          <span className="xl:hidden"><TimerPill compact /></span>
          <span className="hidden xl:inline-flex"><TimerPill /></span>
          <span className="hidden items-center gap-2 md:flex">
            <QuickLogTrigger iconOnlyBelowXl className="h-9" />
            <QuickPostTrigger iconOnlyBelowXl className="h-9" />
          </span>
          <button type="button" className="icon-button hidden md:flex" aria-label="Notifications">
            <BellIcon className="size-4" aria-hidden="true" />
          </button>
          <UserMenu profile={profile} variant="bar" />
        </div>
      </div>
    </header>
  );
}
