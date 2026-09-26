'use client';

import * as React from 'react';
import { BellIcon, MenuIcon } from 'lucide-react';

import { useNavDrawer } from '@/components/layout/nav-drawer-context';
import { QuickLogTrigger } from '@/components/logs/quick-log-trigger';

export interface WorkspaceHeaderProps {
  /** Page title, e.g. "Team performance". */
  title: string;
  /** One line of context beneath the title. */
  description?: string;
  /**
   * Page-specific controls, rendered to the right of the global ones — so
   * Recompute snapshot lands beside Log Hours and the bell rather than in a
   * separate bar.
   */
  actions?: React.ReactNode;
}

/**
 * The single header row for a workspace page.
 *
 * Consolidates everything that used to be spread across a shell header and a
 * per-page title block: the drawer toggle, the page title, the global actions, and
 * whatever the page itself contributes.
 *
 * Rendered by each page rather than by the shell. A layout cannot see its child's
 * title or actions, and threading them upward through context would be a lot of
 * machinery to avoid one prop.
 */
export function WorkspaceHeader({
  title,
  description,
  actions,
}: WorkspaceHeaderProps) {
  const { setOpen } = useNavDrawer();

  return (
    <header className="border-border bg-background sticky top-0 z-20 border-b">
      {/* Pinned to --spacing-header while it fits on one row, so sticky content
          further down the page has a reliable offset to sit under. Narrow
          viewports wrap the actions onto a second row and grow past it. */}
      <div className="flex min-h-(--spacing-header) flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 lg:px-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="icon-button"
        >
          <MenuIcon className="size-4" aria-hidden="true" />
        </button>

        <div className="flex min-w-0 flex-col">
          <h1 className="text-foreground truncate text-base font-semibold tracking-tight">
            {title}
          </h1>
          {description ? (
            <p className="text-muted-foreground truncate text-xs">
              {description}
            </p>
          ) : null}
        </div>

        {/* Global actions, then whatever the page adds. */}
        <div className="ml-auto flex items-center gap-2">
          <QuickLogTrigger variant="button" label="Log Hours" />

          <button
            type="button"
            className="icon-button"
            aria-label="Notifications"
          >
            <BellIcon className="size-4" aria-hidden="true" />
          </button>

          {actions}
        </div>
      </div>
    </header>
  );
}
