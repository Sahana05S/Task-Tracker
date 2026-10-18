import * as React from 'react';

export interface WorkspaceHeaderProps {
  title: string;
  description?: string;
  /**
   * Page-specific actions, shown at the right of the title (wrapping below it
   * on narrow screens). Global actions — Log hours, notifications, account —
   * live in the shell's top bar.
   */
  actions?: React.ReactNode;
}

/**
 * Page title row. Navigation and global actions moved to the shell's sticky top
 * bar in the redesign; this row is no longer sticky, so the top bar is the
 * single sticky offset (`--spacing-header`) for content further down.
 */
export function WorkspaceHeader({ title, description, actions }: WorkspaceHeaderProps) {
  return (
    <header>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 px-4 pt-6 pb-2 lg:px-6">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-foreground text-2xl font-bold tracking-tight lg:text-[1.75rem]">{title}</h1>
          {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
        </div>
        {actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
