'use client';

import Link from 'next/link';
import { LogOutIcon, SettingsIcon } from 'lucide-react';

import { logout } from '@/app/auth/actions';
import { RoleBadge } from '@/components/tracker/tracker-badges';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getInitials } from '@/lib/utils';
import type { User } from '@/types/tracker';

export interface UserMenuProps {
  profile: User;
}

/**
 * Account menu.
 *
 * The trigger is initials only — a monospaced two-character tile that fits the
 * 56px rail without truncating anything. Name, email and role are not shown in
 * the shell at all; they live in the dropdown, which is where someone looks when
 * they actually want them.
 *
 * This is the single access point for Settings and Sign Out. No duplicate
 * sign-out control exists in the rail, the drawer or any header.
 */
export function UserMenu({ profile }: UserMenuProps) {
  const initials = getInitials(profile.fullName);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${profile.fullName}`}
        title={profile.fullName}
        className="bg-muted text-foreground hover:bg-primary-subtle hover:text-primary focus-visible:ring-primary/30 flex size-9 shrink-0 items-center justify-center rounded-md font-mono text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        {initials}
      </DropdownMenuTrigger>

      <DropdownMenuContent side="right" align="end" className="w-60">
        {/*
          Identity block. Plain markup rather than DropdownMenuLabel: this is
          three lines of information, not a heading for the items below it.
        */}
        <div className="flex flex-col gap-1.5 px-2.5 py-2">
          <span className="text-foreground truncate text-sm font-semibold">
            {profile.fullName}
          </span>
          <span className="text-muted-foreground truncate text-xs">
            {profile.email}
          </span>
          <span className="flex items-center gap-2">
            <RoleBadge role={profile.role} />
            <span className="text-muted-foreground font-mono text-[10px]">
              {profile.employeeId}
            </span>
          </span>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/settings">
            <SettingsIcon aria-hidden="true" />
            Settings
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
