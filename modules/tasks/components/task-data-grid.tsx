'use client';

import * as React from 'react';
import Link from 'next/link';

import { checklistWorkHref } from '@/modules/checklists/client';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
  ListChecksIcon,
  MoreHorizontalIcon,
} from 'lucide-react';

import {
  headerState,
  toggleRow,
  toggleVisible,
  type Selection,
} from '@/modules/tasks/components/mission-selection';
import { ProgressInput } from '@/modules/tasks/components/progress-input';
import { StatusSelect } from '@/modules/tasks/components/status-select';
import type { WaypointSlotComponent } from '@/modules/tasks/components/task-card-list';
import { TaskRowMenuItems, type TaskRowActions } from '@/modules/tasks/components/task-row-menu';
import { FreshnessIndicator, PriorityBadge } from '@/shared/ui/tracker-badges';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { EMPTY_EFFORT, type TaskEffort } from '@/modules/tasks/internal/effort';
import {
  nextSortState,
  type TaskSortKey,
  type TaskSortState,
} from '@/modules/tasks/internal/filters';
import { canUpdateTaskOwnFields } from '@/modules/tasks/internal/permissions';
import { formatDate, isOverdue, formatHours } from '@/shared/tracker/format';
import { cn, getInitials } from '@/shared/utils';
import type { Task, User } from '@/types/tracker';

export interface TaskDataGridProps {
  tasks: readonly Task[];
  /** assigneeId to display name. */
  memberNames: ReadonlyMap<string, string>;
  /** taskId to logged-hour totals, aggregated from `daily_task_logs`. */
  effortByTask: ReadonlyMap<string, TaskEffort>;
  currentUser: User;
  /** True for managing_director and project_engineer. */
  canManage: boolean;
  sort: TaskSortState;
  onSortChange: (next: TaskSortState) => void;
  /** Selected rows; always a subset of `tasks`. */
  selection: Selection;
  onSelectionChange: (next: Selection) => void;
  actions: TaskRowActions;
  /** The Waypoint column's cell; the column is left out without it. */
  WaypointSlot?: WaypointSlotComponent;
}

interface ColumnDef {
  readonly key: TaskSortKey | null;
  readonly label: string;
  readonly numeric?: boolean;
  /** Read by screen readers only (the actions column). */
  readonly hidden?: boolean;
  /** Shown only when the composing page fills `WaypointSlot`. */
  readonly waypointSlot?: boolean;
}

/**
 * The working set from the sheet's Tasks tab (slice 3). Scale, scaled
 * progress, productivity, reviewers, comments and the dates live in the row's
 * Quick summary.
 */
const COLUMNS: readonly ColumnDef[] = [
  { key: 'title', label: 'Title' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'priority', label: 'Priority' },
  { key: 'status', label: 'Status' },
  { key: 'progressPercentage', label: 'Progress', numeric: true },
  { key: null, label: 'Waypoint', waypointSlot: true },
  { key: 'hoursLogged', label: 'Hours', numeric: true },
  { key: 'freshness', label: 'Freshness' },
  { key: 'dueDate', label: 'Due' },
  { key: null, label: 'Checklist' },
  { key: null, label: 'Actions', hidden: true },
];

/**
 * Dense spreadsheet grid from 768px up.
 *
 * Structural notes:
 *  - The header row and the first column (selection checkbox and tag) are both
 *    sticky, so the grid keeps its bearings when scrolled in either direction.
 *  - The header checkbox selects the visible rows the viewer can act on; the
 *    shell prunes the selection whenever filters hide a row.
 *  - Status and progress are editable in place. Everything else routes through
 *    the row menu.
 */
export function TaskDataGrid({
  tasks,
  memberNames,
  effortByTask,
  currentUser,
  canManage,
  sort,
  onSortChange,
  selection,
  onSelectionChange,
  actions,
  WaypointSlot,
}: TaskDataGridProps) {
  const columns = WaypointSlot ? COLUMNS : COLUMNS.filter((column) => !column.waypointSlot);
  // Only rows the viewer can act on are selectable: open missions, and for
  // members their own. A batch is atomic, so one refused row would fail it all.
  const selectableIds = React.useMemo(
    () => tasks.filter((task) => canUpdateTaskOwnFields(currentUser, task)).map((task) => task.id),
    [tasks, currentUser],
  );
  const allState = headerState(selection, selectableIds);

  return (
    // Focus keeps rows clear of the sticky action bar underneath.
    <div className="soft-card-clip relative overflow-x-auto [&_:is(a,button,input)]:scroll-mb-24">
      <table className="sheet-grid">
        <caption className="sr-only">
          Missions. Column headers are buttons that sort the table; the first
          column selects rows for the actions bar.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="sheet-grid-frozen" aria-sort={ariaSort(sort, 'taskTag')}>
              <div className="flex items-center gap-3">
                <RowCheckbox
                  checked={allState}
                  label={allState === true ? 'Clear selection' : `Select all ${selectableIds.length} visible missions you can act on`}
                  disabled={selectableIds.length === 0}
                  onChange={() => onSelectionChange(toggleVisible(selection, selectableIds))}
                />
                <SortButton label="Tag" sortKey="taskTag" sort={sort} onSortChange={onSortChange} />
              </div>
            </th>
            {columns.map((column) => (
              <HeaderCell key={column.label} column={column} sort={sort} onSortChange={onSortChange} />
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const canEditOwnFields = canUpdateTaskOwnFields(currentUser, task);
            const effort = effortByTask.get(task.id) ?? EMPTY_EFFORT;
            const overdue =
              isOverdue(task.dueDate) &&
              task.status !== 'Done' &&
              task.status !== 'Discarded';
            const selected = selection.has(task.id);
            const href = `/tasks/${encodeURIComponent(task.taskTag)}`;

            return (
              <tr
                key={task.id}
                data-selected={selected || undefined}
                className="group data-[selected]:[&>td]:bg-primary-subtle"
              >
                <td className="sheet-grid-frozen">
                  <div className="flex items-center gap-3">
                    <RowCheckbox
                      checked={selected}
                      label={`Select ${task.taskTag}`}
                      disabled={!canEditOwnFields}
                      onChange={() => onSelectionChange(toggleRow(selection, task.id))}
                    />
                    <Link href={href} className="task-tag whitespace-nowrap hover:underline">
                      {task.taskTag}
                    </Link>
                  </div>
                </td>

                <td className="max-w-64 min-w-40">
                  <span className="block truncate" title={task.title}>
                    {task.title}
                  </span>
                  {task.archivedEffectiveDate ? (
                    <span className="text-muted-foreground block text-xs">Archived, read-only</span>
                  ) : null}
                </td>

                <td>
                  <PeopleCell names={task.assigneeIds.map((id) => memberNames.get(id) ?? 'Unknown')} />
                </td>

                <td>
                  <PriorityBadge priority={task.priority} />
                </td>

                <td>
                  <StatusSelect
                    version={task.lifecycleVersion}
                    taskId={task.id}
                    taskTag={task.taskTag}
                    status={task.status}
                    canEdit={canEditOwnFields}
                  />
                </td>

                <td className="w-28">
                  <ProgressInput
                    version={task.lifecycleVersion}
                    taskId={task.id}
                    taskTag={task.taskTag}
                    progressPercentage={task.progressPercentage}
                    progressOwner={task.progressOwner}
                    canEdit={canEditOwnFields && task.progressOwner !== 'checklist'}
                  />
                </td>

                {WaypointSlot ? (
                  <td className="w-36 max-w-36">
                    <WaypointSlot taskId={task.id} taskTag={task.taskTag} progress={task.progressPercentage} stopped={Boolean(task.archivedEffectiveDate) || task.status === 'Discarded'} variant="cell" />
                  </td>
                ) : null}

                {/* Aggregated from daily_task_logs; no column on tasks. */}
                <td className="sheet-numeric text-xs">
                  {formatHours(effort.hoursLogged)}
                </td>

                <td>
                  <FreshnessIndicator freshness={task.freshness} />
                </td>

                <td
                  className={cn(
                    'text-xs whitespace-nowrap',
                    overdue ? 'text-overdue font-medium' : 'text-muted-foreground',
                  )}
                >
                  {formatDate(task.dueDate)}
                  {overdue ? <span className="sr-only"> (overdue)</span> : null}
                </td>

                <td>
                  <Link
                    href={checklistWorkHref(task.taskTag)}
                    className="link inline-flex items-center gap-1 text-xs whitespace-nowrap"
                    aria-label={`Master checklist for ${task.taskTag}`}
                  >
                    <ListChecksIcon className="size-3.5" aria-hidden="true" />
                    {task.progressOwner === 'checklist' ? 'Drives progress' : 'Open'}
                  </Link>
                </td>

                {/* Pinned right so the menu is reachable without scrolling sideways. */}
                <td className="group-hover:bg-muted sticky right-0 z-10 bg-card">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Actions for ${task.taskTag}`}
                      >
                        <MoreHorizontalIcon aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <TaskRowMenuItems
                        task={task}
                        canManage={canManage}
                        canEditOwnFields={canEditOwnFields}
                        actions={actions}
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Header                                                                     */
/* -------------------------------------------------------------------------- */

function ariaSort(sort: TaskSortState, key: TaskSortKey): React.AriaAttributes['aria-sort'] {
  if (sort.key !== key) return 'none';
  return sort.direction === 'asc' ? 'ascending' : 'descending';
}

function HeaderCell({
  column,
  sort,
  onSortChange,
}: {
  column: ColumnDef;
  sort: TaskSortState;
  onSortChange: (next: TaskSortState) => void;
}) {
  if (column.key === null) {
    return (
      <th scope="col" className={column.hidden ? 'sticky right-0 z-30' : undefined}>
        <span className={column.hidden ? 'sr-only' : undefined}>{column.label}</span>
      </th>
    );
  }
  return (
    <th scope="col" aria-sort={ariaSort(sort, column.key)} className={cn(column.numeric && 'text-right')}>
      <SortButton
        label={column.label}
        sortKey={column.key}
        sort={sort}
        onSortChange={onSortChange}
        numeric={column.numeric}
      />
    </th>
  );
}

function SortButton({
  label,
  sortKey,
  sort,
  onSortChange,
  numeric = false,
}: {
  label: string;
  sortKey: TaskSortKey;
  sort: TaskSortState;
  onSortChange: (next: TaskSortState) => void;
  numeric?: boolean;
}) {
  const active = sort.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSortChange(nextSortState(sort, sortKey))}
      className={cn(
        'inline-flex items-center gap-1 rounded-sm text-xs font-semibold uppercase transition-colors',
        'focus-visible:ring-ring/40 focus-visible:ring-2 focus-visible:outline-none',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        numeric && 'flex-row-reverse',
      )}
    >
      {label}
      {active ? (
        sort.direction === 'asc' ? (
          <ArrowUpIcon className="size-3" aria-hidden="true" />
        ) : (
          <ArrowDownIcon className="size-3" aria-hidden="true" />
        )
      ) : (
        <ChevronsUpDownIcon className="text-placeholder size-3" aria-hidden="true" />
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Cells                                                                      */
/* -------------------------------------------------------------------------- */

/** Native checkbox; `indeterminate` can only be set from script. */
function RowCheckbox({
  checked,
  label,
  disabled = false,
  onChange,
}: {
  checked: boolean | 'indeterminate';
  label: string;
  disabled?: boolean;
  onChange: () => void;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = checked === 'indeterminate';
  }, [checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked === true}
      onChange={onChange}
      aria-label={label}
      disabled={disabled}
      className="accent-primary size-4 shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}

function PeopleCell({ names }: { names: readonly string[] }) {
  const displayNames = names.length > 0 ? names : ['Unassigned'];
  const label = displayNames.join(', ');

  return (
    <div className="flex items-center gap-2">
      <Avatar className="size-6">
        <AvatarFallback className="text-[10px]">
          {getInitials(displayNames[0])}
        </AvatarFallback>
      </Avatar>
      <span className="text-foreground max-w-28 truncate text-xs" title={label}>
        {displayNames[0]}
      </span>
      {displayNames.length > 1 ? (
        <span className="badge-soft badge-neutral px-1.5 py-0 text-[10px]" title={label}>
          +{displayNames.length - 1}
        </span>
      ) : null}
    </div>
  );
}
