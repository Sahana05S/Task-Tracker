'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BellIcon, GaugeIcon, PlusIcon, SearchIcon } from 'lucide-react';

import { QuickLogTrigger } from '@/components/logs/quick-log-trigger';
import { UserMenu } from '@/components/layout/user-menu';
import { isNavItemActive, NAV_ITEMS } from '@/components/layout/nav-items';
import { Button } from '@/components/ui/button';
import { TASK_MANAGER_ROLES } from '@/lib/tracker/enums';
import { cn } from '@/lib/utils';
import type { User, UserRole } from '@/types/tracker';

export interface WorkspaceHeaderProps {
  profile: User;
}

/**
 * Workspace header.
 *
 * Carries the task search, a notification bell, the profile trigger, and the
 * primary actions for the workspace.
 *
 * The action pills are the domain equivalents of the reference design's "Add
 * Project" and "Import Data": this product has no projects to add, so the primary
 * action creates a task and the secondary one opens the effort logger. Task
 * creation is a manager right, so that pill only renders for the roles that hold
 * it — the Server Action re-checks regardless.
 */
export function WorkspaceHeader({ profile }: WorkspaceHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchRef = React.useRef<HTMLInputElement>(null);

  const active = NAV_ITEMS.find((item) => isNavItemActive(pathname, item.href));
  const canManage = (TASK_MANAGER_ROLES as readonly UserRole[]).includes(
    profile.role,
  );

  /**
   * Focus the search field on the advertised shortcut.
   *
   * Bound to Cmd/Ctrl+F, which is what the badge promises. The browser's own find
   * bar is suppressed only while this workspace is focused; pressing Escape in
   * the field releases it again.
   */
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = searchRef.current?.value.trim() ?? '';
    // The task grid owns filtering, so search hands off to it by query string.
    router.push(term === '' ? '/tasks' : `/tasks?q=${encodeURIComponent(term)}`);
  };

  return (
    <header className="sticky top-0 z-20 flex h-(--spacing-header) items-center gap-3 bg-background px-4 lg:px-6">
      {/* Mobile branding, since the sidebar that normally carries it is hidden */}
      <Link href="/dashboard" className="flex items-center gap-2 md:hidden">
        <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-xl">
          <GaugeIcon className="size-4" aria-hidden="true" />
        </span>
        <span className="text-foreground text-sm font-bold">TaskPulse</span>
      </Link>

      {/* Search with its keyboard hint */}
      <form
        onSubmit={submitSearch}
        role="search"
        className="hidden min-w-0 flex-1 md:block md:max-w-sm"
      >
        <div className="soft-card flex h-11 items-center gap-2.5 px-4">
          <SearchIcon
            className="text-muted-foreground size-4 shrink-0"
            aria-hidden="true"
          />
          <input
            ref={searchRef}
            type="search"
            name="q"
            placeholder="Search task"
            aria-label="Search tasks by title or tag"
            className="text-foreground min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          <kbd className="kbd hidden shrink-0 sm:inline-flex" aria-hidden="true">
            <span className="text-[13px] leading-none">⌘</span>F
          </kbd>
        </div>
      </form>

      <div className="ml-auto flex items-center gap-2 lg:gap-3">
        {/* Primary actions. Hidden on the narrowest viewports, where the bottom
            bar's action button covers logging. */}
        {canManage ? (
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/tasks?new=1">
              <PlusIcon aria-hidden="true" />
              Add Task
            </Link>
          </Button>
        ) : null}

        <span className="hidden sm:inline-flex">
          <QuickLogTrigger variant="button" label="Log Hours" />
        </span>

        <button
          type="button"
          className="icon-button hidden sm:flex"
          aria-label="Notifications"
        >
          <BellIcon className="size-4.5" aria-hidden="true" />
        </button>

        {/* Profile. Compact on mobile; the sidebar owns it from md up, but the
            email is worth surfacing here on the widest screens too. */}
        <span className={cn('md:hidden')}>
          <UserMenu profile={profile} variant="compact" />
        </span>
      </div>

      {/* Active section name, announced for assistive technology. The visible
          page title is rendered by each route. */}
      <h1 className="sr-only">{active?.label ?? 'Workspace'}</h1>
    </header>
  );
}
