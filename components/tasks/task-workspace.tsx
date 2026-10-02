'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircleIcon, LoaderCircleIcon, SearchXIcon } from 'lucide-react';
import { toast } from 'sonner';

import { deleteTask } from '@/app/tasks/actions';
import { TaskCardList } from '@/components/tasks/task-card-list';
import { TaskDataGrid } from '@/components/tasks/task-data-grid';
import { TaskDialog } from '@/components/tasks/task-dialog';
import { TaskFilters } from '@/components/tasks/task-filters';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { TaskEffort } from '@/lib/logs/metrics';
import {
  DEFAULT_SORT,
  EMPTY_FILTERS,
  filterTasks,
  hasActiveFilters,
  sortTasks,
  type TaskFilterState,
  type TaskSortState,
} from '@/lib/tasks/filters';
import { canManageTasks } from '@/lib/tasks/permissions';
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
}

/**
 * Client shell for the task module.
 *
 * Owns filter state, sort state and which drawer is open, then hands the
 * resulting list to whichever view the viewport calls for. Both views are
 * mounted and toggled with CSS rather than a media-query hook, so the correct
 * one is present in the server-rendered HTML and nothing shifts on hydration.
 */
export function TaskWorkspace({
  tasks,
  members,
  effortEntries,
  currentUser,
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
  React.useEffect(() => {
    if (!wantsNew) return;
    setEditingTask(null);
    setDialogOpen(true);
    router.replace('/tasks', { scroll: false });
  }, [wantsNew, router]);

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
      {/* Title and the Add Task control live in the page header, so this
          component starts straight into the filter bar. */}
      <TaskFilters
        filters={filters}
        onChange={setFilters}
        members={members}
        resultCount={visibleTasks.length}
        totalCount={tasks.length}
      />

      {tasks.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          description={
            canManage
              ? 'Create the first task to start tracking effort and progress.'
              : 'Once a manager assigns you work, it will appear here.'
          }
        />
      ) : visibleTasks.length === 0 ? (
        <EmptyState
          title="No tasks match these filters"
          description="Widen or clear the filters to see more of the tracker."
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
          {/* Grid from 1024px up. */}
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

          {/* Cards below 1024px, covering mobile and tablet. */}
          <div className="lg:hidden">
            <TaskCardList
              tasks={visibleTasks}
              memberNames={memberNames}
              effortByTask={effortByTask}
              currentUser={currentUser}
              canManage={canManage}
              onEdit={openEdit}
              onRequestDelete={setPendingDelete}
            />
          </div>
        </>
      )}

      <TaskDialog
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
          description: 'The task and its effort logs have been removed.',
        });
      } else {
        // Kept inline: the drawer is still open and the message belongs next to
        // the action that was refused.
        setError(result.error ?? 'Could not delete the task.');
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
          <SheetTitle>Delete task</SheetTitle>
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
            className="mx-4 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
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
