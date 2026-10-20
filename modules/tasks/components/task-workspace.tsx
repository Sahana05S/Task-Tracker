'use client';

import type { NativeTemplate } from '@/modules/tasks/internal/details-contract';
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircleIcon, LoaderCircleIcon, SearchXIcon } from 'lucide-react';
import { toast } from 'sonner';

import { deleteTask } from '@/modules/tasks/actions';
import { TaskCardList, type LogHoursActionComponent } from '@/modules/tasks/components/task-card-list';
import { TaskDataGrid } from '@/modules/tasks/components/task-data-grid';
import { TaskDialog } from '@/modules/tasks/components/task-dialog';
import { TaskFilters, type MissionView } from '@/modules/tasks/components/task-filters';
import { Button } from '@/shared/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet';
import type { TaskEffort } from '@/modules/tasks/internal/effort';
import {
  DEFAULT_SORT,
  EMPTY_FILTERS,
  filterTasks,
  hasActiveFilters,
  sortTasks,
  type TaskFilterState,
  type TaskSortState,
} from '@/modules/tasks/internal/filters';
import { canManageTasks } from '@/modules/tasks/internal/permissions';
import type { Task, User } from '@/types/tracker';

export interface TaskWorkspaceProps {
  tasks: readonly Task[];
  members: readonly User[];
  /**
   * Logged-hour totals per task, aggregated from `daily_task_logs`.
   *
   * Passed as entries rather than a Map because this crosses the server-to-client
   * boundary, and Maps do not survive React's serialisation.
   */
  effortEntries: readonly (readonly [string, TaskEffort])[];
  currentUser: User;
  templates?: readonly NativeTemplate[];
  /** The "Log hours" button on each open mission card, supplied by the composing page. */
  LogHoursAction?: LogHoursActionComponent;
}

/**
 * Client shell for the Missions list.
 *
 * Owns filter state, sort state and which drawer is open, then hands the
 * resulting list to the chosen view. Cards are the default at every width;
 * `?view=table` adds the dense grid from 1024px up, with cards still below it.
 * The view lives in the URL so it survives a refresh and is visible in the
 * server-rendered HTML, so nothing shifts on hydration.
 */
export function TaskWorkspace({
  tasks,
  members,
  effortEntries,
  currentUser,
  templates=[],
  LogHoursAction,
}: TaskWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filters, setFilters] = React.useState<TaskFilterState>(EMPTY_FILTERS);
  const [sort, setSort] = React.useState<TaskSortState>(DEFAULT_SORT);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<Task | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<Task | null>(null);

  /**
   * `?new=1` opens the create form.
   *
   * The Add Task control lives in the page header, which is a sibling of this
   * component, so the request arrives through the URL rather than through shared
   * state. The parameter is cleared on open so a refresh does not reopen the form.
   */
  const wantsNew = searchParams.get('new') === '1';
  const view: MissionView = searchParams.get('view') === 'table' ? 'table' : 'cards';
  const listHref = view === 'table' ? '/tasks?view=table' : '/tasks';
  React.useEffect(() => {
    if (!wantsNew) return;
    setEditingTask(null);
    setDialogOpen(true);
    router.replace(listHref, { scroll: false });
  }, [wantsNew, router, listHref]);

  const changeView = (next: MissionView) => {
    router.replace(next === 'table' ? '/tasks?view=table' : '/tasks', { scroll: false });
  };

  const canManage = canManageTasks(currentUser.role);

  const memberNames = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members) map.set(member.id, member.fullName);
    return map;
  }, [members]);

  const effortByTask = React.useMemo(
    () => new Map<string, TaskEffort>(effortEntries),
    [effortEntries],
  );

  const visibleTasks = React.useMemo(
    () =>
      sortTasks(filterTasks(tasks, filters), sort, memberNames, effortByTask),
    [tasks, filters, sort, memberNames, effortByTask],
  );

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Title and the New mission control live in the page header, so this
          component starts straight into the toolbar. */}
      <TaskFilters
        filters={filters}
        onChange={setFilters}
        members={members}
        tasks={tasks}
        resultCount={visibleTasks.length}
        totalCount={tasks.length}
        view={view}
        onViewChange={changeView}
      />

      {tasks.length === 0 ? (
        <EmptyState
          title="No missions yet"
          description={
            canManage
              ? 'Create the first mission to start tracking effort and progress.'
              : 'Once a manager assigns you a mission, it will appear here.'
          }
        />
      ) : visibleTasks.length === 0 ? (
        <EmptyState
          title="No missions match these filters"
          description="Widen or clear the filters to see more missions."
          action={
            hasActiveFilters(filters) ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFilters(EMPTY_FILTERS)}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {view === 'table' ? (
            /* Table from 1024px up; cards remain below it. */
            <div className="hidden lg:block">
              <TaskDataGrid
                tasks={visibleTasks}
                memberNames={memberNames}
                effortByTask={effortByTask}
                currentUser={currentUser}
                canManage={canManage}
                sort={sort}
                onSortChange={setSort}
                onEdit={openEdit}
                onRequestDelete={setPendingDelete}
              />
            </div>
          ) : null}

          <div className={view === 'table' ? 'lg:hidden' : undefined}>
            <TaskCardList
              tasks={visibleTasks}
              memberNames={memberNames}
              effortByTask={effortByTask}
              currentUser={currentUser}
              canManage={canManage}
              onEdit={openEdit}
              onRequestDelete={setPendingDelete}
              LogHoursAction={LogHoursAction}
            />
          </div>
        </>
      )}

      <TaskDialog
        templates={templates}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
        members={members}
        defaultAssigneeId={currentUser.id}
      />

      <DeleteConfirmation
        task={pendingDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                */
/* -------------------------------------------------------------------------- */

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="soft-card flex flex-col items-center gap-2 px-6 py-14 text-center">
      <SearchXIcon
        className="text-muted-foreground size-5"
        aria-hidden="true"
      />
      <p className="text-foreground text-sm font-semibold">{title}</p>
      <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Delete confirmation                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Explicit confirmation before deletion.
 *
 * Deleting a task cascades to its `daily_task_logs` rows, so the logged effort
 * history goes with it. That is called out here because it is not recoverable
 * and not obvious.
 */
function DeleteConfirmation({
  task,
  onClose,
}: {
  task: Task | null;
  onClose: () => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (task) setError(null);
  }, [task]);

  const confirm = () => {
    if (!task) return;
    const { taskTag } = task;

    startTransition(async () => {
      const result = await deleteTask(task.id);
      if (result.success) {
        onClose();
        // Reported by toast because the drawer that asked the question is gone by
        // the time the answer arrives.
        toast.success(`${taskTag} deleted`, {
          description: 'The mission and its effort logs have been removed.',
        });
      } else {
        // Kept inline: the drawer is still open and the message belongs next to
        // the action that was refused.
        setError(result.error ?? 'Could not delete the mission.');
      }
    });
  };

  return (
    <Sheet
      open={task !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <SheetContent side="bottom" className="sm:mx-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Delete mission</SheetTitle>
          <SheetDescription>
            {task ? (
              <>
                <span className="task-tag">{task.taskTag}</span> will be removed
                permanently, along with every effort log recorded against it.
              </>
            ) : null}
          </SheetDescription>
        </SheetHeader>

        {error ? (
          <div
            role="alert"
            className="mx-4 flex items-start gap-2 rounded-md border border-danger-border bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            <AlertCircleIcon
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>{error}</span>
          </div>
        ) : null}

        <SheetFooter className="flex-row justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={confirm}
            disabled={pending}
          >
            {pending ? (
              <>
                <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
                Deleting
              </>
            ) : (
              'Delete permanently'
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
