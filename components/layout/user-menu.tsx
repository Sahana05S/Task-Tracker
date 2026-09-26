'use client';

import Link from 'next/link';
import { ChevronsUpDownIcon, ClockIcon, LogOutIcon } from 'lucide-react';

import { logout } from '@/app/auth/actions';
import { RoleBadge } from '@/components/tracker/tracker-badges';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn, getInitials } from '@/lib/utils';
import type { User } from '@/types/tracker';

export interface UserMenuProps {
  profile: User;
  /**
   * `expanded` shows the name and email beside the avatar and is used in the
   * sidebar. `compact` is avatar-only, for the mobile header.
   */
  variant: 'expanded' | 'compact';
}

/**
 * Profile trigger and account menu.
 *
 * The expanded form shows name over email, which is what the reference layout
 * puts next to the avatar, with the role badge inside the menu where there is room
 * for it to be read.
 */
export function UserMenu({ profile, variant }: UserMenuProps) {
  const initials = getInitials(profile.fullName);
  const isExpanded = variant === 'expanded';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex items-center transition-colors',
          'focus-visible:ring-primary/30 focus-visible:ring-2 focus-visible:outline-none',
          isExpanded
            ? 'soft-inset w-full gap-2.5 rounded-xl p-2.5 hover:bg-slate-100 md:justify-center lg:justify-start'
            : 'gap-2 rounded-full p-0.5',
        )}
        aria-label={`Account menu for ${profile.fullName}`}
      >
        <Avatar className="size-9">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>

        {isExpanded ? (
          <>
            {/* Name over email, matching the reference profile block. Only
                visible in the expanded sidebar. */}
            <span className="hidden min-w-0 flex-1 flex-col items-start text-left lg:flex">
              <span className="text-foreground w-full truncate text-sm font-semibold">
                {profile.fullName}
              </span>
              <span className="text-muted-foreground w-full truncate text-xs">
                {profile.email}
              </span>
            </span>
            <ChevronsUpDownIcon
              className="text-muted-foreground hidden size-4 shrink-0 lg:block"
              aria-hidden="true"
            />
          </>
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-2 py-2.5">
          <span className="flex flex-col">
            <span className="text-foreground truncate text-sm font-semibold">
              {profile.fullName}
            </span>
            <span className="text-muted-foreground truncate text-xs font-normal">
              {profile.email}
            </span>
            <span className="text-muted-foreground truncate text-xs font-normal">
              {profile.employeeId}
            </span>
          </span>
          <RoleBadge role={profile.role} className="self-start" />
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {/* On mobile the bottom bar has no Logs slot, so this is the route in. */}
        <DropdownMenuItem asChild>
          <Link href="/logs">
            <ClockIcon aria-hidden="true" />
            Log history
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Server Action submit. The form wraps the item so the menu entry is
            itself the submit button. */}
        <form action={logout}>
          <DropdownMenuItem asChild variant="destructive">
            <button type="submit" className="w-full">
              <LogOutIcon aria-hidden="true" />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
