'use client';

import * as React from 'react';
import Link from 'next/link';
import { LogOutIcon, SettingsIcon, SparklesIcon } from 'lucide-react';

import { logout } from '@/modules/auth/actions';
import { RoleBadge } from '@/shared/ui/tracker-badges';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { THEME_OPTIONS, useTheme, type ThemePreference } from '@/shared/ui/theme';
import { cn, getInitials } from '@/shared/utils';
import type { User } from '@/types/tracker';

export interface UserMenuProps {
  profile: User;
  /**
   * `bar` is the round initials avatar in the top bar (every width).
   * `row` is the wider trigger at the foot of the phone "More" sheet, where
   * there is room to show a name.
   */
  variant?: 'bar' | 'row';
  className?: string;
}

/**
 * Account menu.
 *
 * The access point for Settings and Sign Out: the top-bar avatar at every
 * width, repeated as a row at the foot of the phone "More" sheet.
 */
export function UserMenu({
  profile,
  variant = 'bar',
  className,
}: UserMenuProps) {
  const initials = getInitials(profile.fullName);
  const { preference, setPreference } = useTheme();

  /*
    Radix closes the menu when an item is selected, which unmounts this form.
    A submit button inside the item therefore never gets to submit: the state
    update from closing flushes synchronously during the click, the node leaves
    the document, and the browser has no form left to submit by the time it
    processes the click's default action. Submitting through the ref sidesteps
    the race entirely — `requestSubmit` fires before the menu begins to close.
  */
  const signOutFormRef = React.useRef<HTMLFormElement>(null);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${profile.fullName}`}
        title={profile.fullName}
        className={cn(
          'focus-visible:ring-primary/30 group flex shrink-0 items-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none',
          variant === 'bar'
            ? 'bg-primary text-primary-foreground hover:bg-primary-hover size-9 justify-center rounded-full text-xs font-bold'
            : 'hover:bg-muted w-full gap-2.5 px-2 py-1.5 text-left',
          className,
        )}
      >
        {variant === 'bar' ? (
          initials
        ) : (
          <>
            <span className="bg-muted text-foreground group-hover:bg-primary-subtle group-hover:text-primary flex size-8 shrink-0 items-center justify-center rounded-md font-mono text-xs font-semibold transition-colors">
              {initials}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-foreground truncate text-sm font-medium">
                {profile.fullName}
              </span>
              <span className="text-muted-foreground truncate text-[11px]">
                {profile.email}
              </span>
            </span>
          </>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side={variant === 'bar' ? 'bottom' : 'top'}
        align="end"
        sideOffset={8}
        // Room to shift rather than clip against the viewport edge.
        collisionPadding={12}
        className="w-60"
      >
        {/*
          Identity block. Plain markup rather than DropdownMenuLabel: this is
          four lines of information, not a heading for the items below it.
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

        {/*
          Navigation stays as real anchors. `asChild` hands Radix's item
          behaviour to the Link, so these keep an href — middle-click, copy link
          and "open in new tab" all work, and assistive technology announces a
          link rather than a menu item that happens to navigate.
        */}
        <DropdownMenuItem asChild>
          <Link href="/today">
            <SparklesIcon aria-hidden="true" />
            Today
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/settings">
            <SettingsIcon aria-hidden="true" />
            Profile &amp; settings
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Appearance for this device; the same choice as Settings > Profile. */}
        <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={preference} onValueChange={(value) => setPreference(value as ThemePreference)}>
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} onSelect={(event) => event.preventDefault()}>
              <Icon className="text-muted-foreground size-4" aria-hidden="true" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <form ref={signOutFormRef} action={logout}>
          <DropdownMenuItem
            variant="destructive"
            onSelect={(event) => {
              // Keep the menu open long enough to submit; the redirect in the
              // `logout` action unmounts the whole shell a moment later.
              event.preventDefault();
              signOutFormRef.current?.requestSubmit();
            }}
          >
            <LogOutIcon aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
