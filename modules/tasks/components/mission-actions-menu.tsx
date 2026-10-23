'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircleIcon, MoreHorizontalIcon } from 'lucide-react';

import { loadMissionActions } from '@/modules/tasks/actions';
import { DeleteMissionSheet } from '@/modules/tasks/components/delete-mission-sheet';
import { TaskDialog } from '@/modules/tasks/components/task-dialog';
import { TaskRowMenuItems, type TaskRowActions } from '@/modules/tasks/components/task-row-menu';
import { OperationDrawer } from '@/modules/tasks/components/tools/operation-drawer';
import type { ToolOperation } from '@/modules/tasks/internal/tools/contract';
import { Button } from '@/shared/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';
import { cn } from '@/shared/utils';
import type { Task } from '@/types/tracker';

type Loaded = NonNullable<Awaited<ReturnType<typeof loadMissionActions>>['data']>;

/**
 * A mission's actions (Done, Copy, Archive, Edit, Delete …) from anywhere it
 * is shown: the mission and checklist pages, Today, a profile. It loads the
 * mission, the member directory and templates only when opened, then uses the
 * same menu items, drawer, dialog and delete sheet as the Missions list.
 */
export function MissionActionsMenu({
  taskId,
  taskTag,
  openHref,
  variant = 'icon',
  className,
}: {
  taskId: string;
  taskTag: string;
  /** "Open mission" link; null on the mission's own page. */
  openHref?: string | null;
  /** `icon` for cards and rows; `button` for page headers. */
  variant?: 'icon' | 'button';
  className?: string;
}) {
  const router = useRouter();
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [operation, setOperation] = React.useState<ToolOperation | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Task | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const result = await loadMissionActions(taskId);
      if (result.success && result.data) setLoaded(result.data);
      else setError(result.error ?? 'Actions are unavailable.');
    } catch {
      setError('Actions are unavailable. Check the connection and try again.');
    }
  }, [taskId]);

  // A fresh read each time the menu opens, so versions are never stale.
  const onOpenChange = (open: boolean) => {
    if (open) { setLoaded(null); void load(); }
  };

  const actions = React.useMemo<TaskRowActions>(() => ({
    onSummary: () => router.push(`/tasks/${encodeURIComponent(taskTag)}`),
    onRun: (command) => setOperation(command),
    onEdit: () => setEditing(true),
    onRequestDelete: (task) => setDeleting(task),
  }), [router, taskTag]);

  const memberNames = React.useMemo(
    () => new Map((loaded?.members ?? []).map((member) => [member.id, member.fullName])),
    [loaded],
  );

  return (
    <>
      <DropdownMenu onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          {variant === 'button' ? (
            <Button variant="outline" shape="pill" className={className}>
              <MoreHorizontalIcon aria-hidden="true" />
              Actions
            </Button>
          ) : (
            <Button variant="ghost" size="icon" aria-label={`Actions for ${taskTag}`} className={cn('size-8', className)}>
              <MoreHorizontalIcon aria-hidden="true" />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          {loaded ? (
            <TaskRowMenuItems
              task={loaded.task}
              canManage={loaded.canManage}
              canEditOwnFields={loaded.canEditOwnFields}
              actions={actions}
              openHref={openHref === undefined ? `/tasks/${encodeURIComponent(taskTag)}` : openHref}
            />
          ) : error ? (
            <DropdownMenuItem onSelect={(event) => { event.preventDefault(); void load(); }}>
              {error} Retry
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled>
              <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
              Loading actions…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {loaded ? (
        <>
          <OperationDrawer
            command={operation}
            tasks={operation ? [loaded.task] : []}
            members={loaded.members}
            memberNames={memberNames}
            onClose={() => setOperation(null)}
            onCommitted={() => router.refresh()}
          />
          <TaskDialog
            templates={loaded.templates}
            open={editing}
            onOpenChange={(open) => { setEditing(open); if (!open) router.refresh(); }}
            task={loaded.task}
            members={loaded.members}
            defaultAssigneeId={loaded.currentUserId}
          />
          <DeleteMissionSheet
            task={deleting}
            onClose={() => setDeleting(null)}
            onDeleted={() => (openHref === null ? router.push('/tasks') : router.refresh())}
          />
        </>
      ) : null}
    </>
  );
}
