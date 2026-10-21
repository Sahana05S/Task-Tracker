'use client';

import type { NativeTemplate } from '@/modules/tasks/internal/details-contract';
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircleIcon, LoaderCircleIcon, SearchXIcon } from 'lucide-react';
import { toast } from 'sonner';

import { deleteTask } from '@/modules/tasks/actions';
import { BulkActionBar } from '@/modules/tasks/components/bulk-action-bar';
import { filtersFromParams, missionsHref, viewFromParams, type MissionView } from '@/modules/tasks/components/filter-params';
import { MissionSummarySheet } from '@/modules/tasks/components/mission-summary-sheet';
import { EMPTY_SELECTION, pruneSelection, type Selection } from '@/modules/tasks/components/mission-selection';
import { TaskCardList, type LogHoursActionComponent } from '@/modules/tasks/components/task-card-list';
import { TaskDataGrid } from '@/modules/tasks/components/task-data-grid';
import { TaskDialog } from '@/modules/tasks/components/task-dialog';
import { TaskFilters } from '@/modules/tasks/components/task-filters';
import type { TaskRowActions } from '@/modules/tasks/components/task-row-menu';
import { OperationDrawer } from '@/modules/tasks/components/tools/operation-drawer';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/mission-ui';
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
import type { ToolOperation } from '@/modules/tasks/internal/tools/contract';
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

/** The operation drawer's subject: one command over a fixed set of missions. */
interface RunningOperation {
  command: ToolOperation;
  tasks: readonly Task[];
}

/**
 * Client shell for the Missions list.
 *
 * Owns filter state, sort state, the table selection and which drawer is open,
 * then hands the resulting list to the chosen view. Cards are the default at
 * every width; `?view=table` adds the dense grid from 768px up, with cards
 * still below it. The view and the filters live in the URL so a refresh or a
 * shared link keeps them; filter changes use `history.replaceState`, which
 * Next.js syncs with `useSearchParams` without a server round trip.
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

  const [filters, setFilters] = React.useState<TaskFilterState>(() => filtersFromParams(searchParams));
  // A navigation that changes the query (the sidebar link, back/forward) wins
  // over local state; our own replaceState writes come back equal and change nothing.
  const query = searchParams.toString();
  const [syncedQuery, setSyncedQuery] = React.useState(query);
  if (query !== syncedQuery) {
    setSyncedQuery(query);
    const fromUrl = filtersFromParams(searchParams);
    if (missionsHref('cards', fromUrl) !== missionsHref('cards', filters)) setFilters(fromUrl);
  }
  const [sort, setSort] = React.useState<TaskSortState>(DEFAULT_SORT);
  const [selected, setSelected] = React.useState<Selection>(EMPTY_SELECTION);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<Task | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<Task | null>(null);
  const [summaryTaskId, setSummaryTaskId] = React.useState<string | null>(null);
  const [operation, setOperation] = React.useState<RunningOperation | null>(null);

  /**
   * `?new=1` opens the create form.
   *
   * The Add Task control lives in the page header, which is a sibling of this
   * component, so the request arrives through the URL rather than through shared
   * state. The parameter is cleared on open so a refresh does not reopen the form.
   */
  const wantsNew = searchParams.get('new') === '1';
  const view = viewFromParams(searchParams);
  const listHref = missionsHref(view, filters);
  React.useEffect(() => {
    if (!wantsNew) return;
    setEditingTask(null);
    setDialogOpen(true);
    router.replace(listHref, { scroll: false });
  }, [wantsNew, router, listHref]);

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
  const visibleIds = React.useMemo(() => visibleTasks.map((task) => task.id), [visibleTasks]);
  // A row that left the list (a refresh removed it) never stays selected.
  const selection = pruneSelection(selected, visibleIds);

  const applyFilters = (next: TaskFilterState) => {
    setFilters(next);
    // A row hidden by the new filters leaves the selection for good.
    const stillVisible = filterTasks(tasks, next).map((task) => task.id);
    setSelected((current) => pruneSelection(current, stillVisible));
    window.history.replaceState(null, '', missionsHref(view, next));
  };

  const changeView = (next: MissionView) => {
    // Selection exists only in the table.
    if (next === 'cards') setSelected(EMPTY_SELECTION);
    window.history.replaceState(null, '', missionsHref(next, filters));
  };

  // Stable, so the memoised card list skips selection-only renders.
  const openEdit = React.useCallback((task: Task) => {
    setEditingTask(task);
    setDialogOpen(true);
  }, []);

  const runOnSelection = (command: ToolOperation) => {
    setOperation({ command, tasks: visibleTasks.filter((task) => selection.has(task.id)) });
  };

  const rowActions = React.useMemo<TaskRowActions>(() => ({
    onSummary: (task) => setSummaryTaskId(task.id),
    onRun: (command, task) => setOperation({ command, tasks: [task] }),
    onEdit: openEdit,
    onRequestDelete: setPendingDelete,
  }), [openEdit]);

  // Re-read from props so the summary reflects edits made while it is open.
  const summaryTask = summaryTaskId ? (tasks.find((task) => task.id === summaryTaskId) ?? null) : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Title and the New mission control live in the page header, so this
          component starts straight into the toolbar. */}
      <TaskFilters
        filters={filters}
        onChange={applyFilters}
        members={members}
        tasks={tasks}
        resultCount={visibleTasks.length}
        totalCount={tasks.length}
        view={view}
        onViewChange={changeView}
      />

      {tasks.length === 0 ? (
        <EmptyState
          icon={SearchXIcon}
          className="soft-card bg-card py-14"
          title="No missions yet"
        >
          {canManage
            ? 'Create the first mission to start tracking effort and progress.'
            : 'Once a manager assigns you a mission, it will appear here.'}
        </EmptyState>
      ) : visibleTasks.length === 0 ? (
        <EmptyState
          icon={SearchXIcon}
          className="soft-card bg-card py-14"
          title="No missions match these filters"
          action={
            hasActiveFilters(filters) ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyFilters(EMPTY_FILTERS)}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {view === 'table' ? (
            /* Table from 768px up; cards remain below it. */
            <div className="hidden md:flex md:flex-col md:gap-3">
              <TaskDataGrid
                tasks={visibleTasks}
                memberNames={memberNames}
                effortByTask={effortByTask}
                currentUser={currentUser}
                canManage={canManage}
                sort={sort}
                onSortChange={setSort}
                selection={selection}
                onSelectionChange={setSelected}
                actions={rowActions}
              />
              <BulkActionBar
                selectedCount={selection.size}
                canManage={canManage}
                onRun={runOnSelection}
                onClear={() => setSelected(EMPTY_SELECTION)}
              />
            </div>
          ) : null}

          <div className={view === 'table' ? 'md:hidden' : undefined}>
            <TaskCardList
              tasks={visibleTasks}
              memberNames={memberNames}
              effortByTask={effortByTask}
              currentUser={currentUser}
              canManage={canManage}
              actions={rowActions}
              LogHoursAction={LogHoursAction}
            />
          </div>
        </>
      )}

      <MissionSummarySheet
        task={summaryTask}
        effortByTask={effortByTask}
        memberNames={memberNames}
        canManage={canManage}
        onClose={() => setSummaryTaskId(null)}
        onEdit={openEdit}
        onRequestDelete={setPendingDelete}
      />

      <OperationDrawer
        command={operation?.command ?? null}
        tasks={operation?.tasks ?? []}
        members={members}
        memberNames={memberNames}
        onClose={() => setOperation(null)}
        // The drawer shows the committed result itself.
        onCommitted={() => setSelected(EMPTY_SELECTION)}
      />

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
