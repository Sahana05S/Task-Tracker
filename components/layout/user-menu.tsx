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
   * `expanded` shows name and role alongside the avatar and is used in the
   * sidebar. `compact` is avatar-only, for the mobile header.
   */
  variant: 'expanded' | 'compact';
}

export function UserMenu({ profile, variant }: UserMenuProps) {
  const initials = getInitials(profile.fullName);
  const isExpanded = variant === 'expanded';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex items-center rounded-md transition-colors',
          'focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:outline-none',
          isExpanded
            ? 'w-full gap-2 p-2 hover:bg-slate-50 md:justify-center lg:justify-start'
            : 'gap-2 p-1 hover:bg-slate-100',
        )}
        aria-label={`Account menu for ${profile.fullName}`}
      >
        <Avatar>
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>

        {isExpanded ? (
          <>
            {/* Name plus role indicator, the two things the sidebar spec calls
                for. Only visible in the expanded sidebar; the icon rail and the
                mobile header fall back to the avatar alone. */}
            <span className="hidden min-w-0 flex-1 flex-col items-start gap-1 text-left lg:flex">
              <span className="w-full truncate text-sm font-medium text-slate-900">
                {profile.fullName}
              </span>
              <RoleBadge role={profile.role} className="max-w-full truncate" />
            </span>
            <ChevronsUpDownIcon
              className="hidden size-4 shrink-0 text-slate-400 lg:block"
              aria-hidden="true"
            />
          </>
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-2 py-2">
          <span className="flex flex-col">
            <span className="truncate text-sm font-medium text-slate-900">
              {profile.fullName}
            </span>
            <span className="truncate text-xs font-normal text-slate-500">
              {profile.email}
            </span>
            <span className="truncate text-xs font-normal text-slate-500">
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
