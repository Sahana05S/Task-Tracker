'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';

import { ProgressInput } from '@/components/tasks/progress-input';
import { StatusSelect } from '@/components/tasks/status-select';
import {
  CategoryBadge,
  FreshnessIndicator,
  PriorityBadge,
} from '@/components/tracker/tracker-badges';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EMPTY_EFFORT, type TaskEffort } from '@/lib/logs/metrics';
import {
  nextSortState,
  type TaskSortKey,
  type TaskSortState,
} from '@/lib/tasks/filters';
import { canUpdateTaskOwnFields } from '@/lib/tasks/permissions';
import { formatDate, formatNumeric, isOverdue } from '@/lib/tracker/format';
import { cn, getInitials } from '@/lib/utils';
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
  onEdit: (task: Task) => void;
  onRequestDelete: (task: Task) => void;
}

interface ColumnDef {
  readonly key: TaskSortKey | null;
  readonly label: string;
  readonly numeric?: boolean;
  readonly frozen?: boolean;
}

const COLUMNS: readonly ColumnDef[] = [
  { key: 'taskTag', label: 'Tag', frozen: true },
  { key: 'category', label: 'Type' },
  { key: 'title', label: 'Title' },
  { key: null, label: 'Comments' },
  { key: 'taskScale', label: 'Scale', numeric: true },
  { key: 'progressPercentage', label: 'Progress', numeric: true },
  { key: 'scaledProgress', label: 'Scaled', numeric: true },
  { key: 'priority', label: 'Priority' },
  { key: 'assignee', label: 'Assignee' },
  { key: null, label: 'Reviewer(s)' },
  { key: 'hoursLogged', label: 'Hours', numeric: true },
  { key: 'taskProductivity', label: 'Prod/h', numeric: true },
  { key: 'freshness', label: 'Freshness' },
  { key: 'status', label: 'Status' },
  { key: null, label: 'Assigned' },
  { key: 'dueDate', label: 'Due' },
  { key: null, label: 'Done' },
  { key: null, label: 'Deadline?' },
  { key: null, label: 'Valid?' },
  { key: null, label: 'Actions' },
];

/**
 * Dense spreadsheet grid for wide viewports.
 *
 * Structural notes:
 *  - The header row and the Tag column are both sticky, so the grid keeps its
 *    bearings when scrolled in either direction.
 *  - The wrapper scrolls horizontally, which is what makes the frozen Tag column
 *    useful and what the tablet layout in the design spec asks for. Lower the
 *    `lg:` gate in the parent to hand tablets the grid instead of cards.
 *  - Status and progress are editable in place. Everything else routes through
 *    the edit form.
 */
export function TaskDataGrid({
  tasks,
  memberNames,
  effortByTask,
  currentUser,
  canManage,
  sort,
  onSortChange,
  onEdit,
  onRequestDelete,
}: TaskDataGridProps) {
  return (
    <div className="soft-card-clip overflow-x-auto">
      <table className="sheet-grid">
        <caption className="sr-only">
          Task tracker grid. Column headers are buttons that sort the table.
        </caption>
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <SortableHeader
                key={column.label}
                column={column}
                sort={sort}
                onSortChange={onSortChange}
              />
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

            return (
              <tr key={task.id}>
                <td className="sheet-grid-frozen">
                  <Link
                    href={`/tasks/${encodeURIComponent(task.taskTag)}`}
                    className="task-tag hover:underline"
                  >
                    {task.taskTag}
                  </Link>
                </td>

                <td>
                  <CategoryBadge category={task.category} />
                </td>

                <td className="max-w-80">
                  <span className="block truncate" title={task.title}>
                    {task.title}
                  </span>
                </td>

                <td className="max-w-56">
                  <span
                    className="block truncate text-xs text-slate-600"
                    title={task.comments ?? ''}
                  >
                    {task.comments ?? '—'}
                  </span>
                </td>

                <td className="sheet-numeric text-xs">
                  {formatNumeric(task.taskScale)}
                </td>

                <td className="w-28">
                  <ProgressInput
          version={task.lifecycleVersion}
                    taskId={task.id}
                    taskTag={task.taskTag}
                    progressPercentage={task.progressPercentage}
                    progressOwner={task.progressOwner}
                    canEdit={canEditOwnFields && task.progressOwner!=='checklist'}
                  />
                </td>

                {/* Generated column: read-only by construction. */}
                <td className="sheet-numeric text-xs font-medium">
                  {formatNumeric(task.scaledProgress)}
                </td>

                <td>
                  <PriorityBadge priority={task.priority} />
                </td>

                <td>
                  <PeopleCell
                    names={namesForIds(task.assigneeIds, memberNames)}
                    fallback="Unassigned"
                  />
                </td>

                <td>
                  <PeopleCell
                    names={namesForIds(task.reviewerIds, memberNames)}
                    fallback="No reviewer"
                    compact
                  />
                </td>

                {/* Aggregated from daily_task_logs; no column on tasks. */}
                <td className="sheet-numeric text-xs">
                  {formatNumeric(effort.hoursLogged)}
                </td>

                <td
                  className="sheet-numeric text-xs font-medium"
                  title={
                    task.taskProductivity === null
                      ? 'No hours logged yet'
                      : `${formatNumeric(task.progressPercentage)} progress points over ${formatNumeric(effort.hoursLogged)} hours`
                  }
                >
                  {formatNumeric(task.taskProductivity)}
                </td>

                <td>
                  <FreshnessIndicator freshness={task.freshness} />
                </td>

                <td>
                  <StatusSelect
          version={task.lifecycleVersion}
                    taskId={task.id}
                    taskTag={task.taskTag}
                    status={task.status}
                    canEdit={canEditOwnFields}
                  />
                  {task.archivedEffectiveDate?<span className="block text-xs">Archived (read-only)</span>:null}
                </td>

                <td className="text-xs whitespace-nowrap text-slate-600">
                  {formatDate(task.assignedDate)}
                </td>

                <td
                  className={cn(
                    'text-xs whitespace-nowrap',
                    overdue ? 'font-medium text-rose-700' : 'text-slate-600',
                  )}
                >
                  {formatDate(task.dueDate)}
                  {overdue ? <span className="sr-only"> (overdue)</span> : null}
                </td>

                <td className="text-xs whitespace-nowrap text-slate-600">
                  {formatDate(task.completedDate)}
                </td>

                <td className="text-xs whitespace-nowrap text-slate-600">
                  {task.metDeadline === null
                    ? '—'
                    : task.metDeadline
                      ? 'Yes'
                      : 'No'}
                </td>

                <td className="text-xs whitespace-nowrap text-slate-600">
                  {task.validForMetrics ? 'Yes' : 'No'}
                </td>

                <td>
                  {canManage&&!task.archivedEffectiveDate ? (
                    <RowActions
                      task={task}
                      onEdit={onEdit}
                      onRequestDelete={onRequestDelete}
                    />
                  ) : null}
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

interface SortableHeaderProps {
  column: ColumnDef;
  sort: TaskSortState;
  onSortChange: (next: TaskSortState) => void;
}

function SortableHeader({ column, sort, onSortChange }: SortableHeaderProps) {
  const frozenClass = column.frozen ? 'sheet-grid-frozen' : undefined;

  // Captured into a local so the null check still narrows inside the onClick
  // closure; a property access would widen back to `TaskSortKey | null`.
  const sortKey = column.key;

  // The actions column has nothing meaningful to order by.
  if (sortKey === null) {
    return (
      <th scope="col" className={frozenClass}>
        <span className="sr-only">{column.label}</span>
      </th>
    );
  }

  const active = sort.key === sortKey;
  const ariaSort = active
    ? sort.direction === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none';

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={cn(frozenClass, column.numeric && 'text-right')}
    >
      <button
        type="button"
        onClick={() => onSortChange(nextSortState(sort, sortKey))}
        className={cn(
          'inline-flex items-center gap-1 rounded-sm text-xs font-semibold uppercase transition-colors',
          'focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:outline-none',
          active
            ? 'text-slate-900'
            : 'text-slate-700 hover:text-slate-900',
          column.numeric && 'flex-row-reverse',
        )}
      >
        {column.label}
        {active ? (
          sort.direction === 'asc' ? (
            <ArrowUpIcon className="size-3" aria-hidden="true" />
          ) : (
            <ArrowDownIcon className="size-3" aria-hidden="true" />
          )
        ) : (
          <ChevronsUpDownIcon
            className="size-3 text-slate-400"
            aria-hidden="true"
          />
        )}
      </button>
    </th>
  );
}

/* -------------------------------------------------------------------------- */
/* Cells                                                                      */
/* -------------------------------------------------------------------------- */

function namesForIds(
  ids: readonly string[],
  memberNames: ReadonlyMap<string, string>,
): string[] {
  return ids.map((id) => memberNames.get(id) ?? 'Unknown');
}

function PeopleCell({
  names,
  fallback,
  compact = false,
}: {
  names: readonly string[];
  fallback: string;
  compact?: boolean;
}) {
  const displayNames = names.length > 0 ? names : [fallback];
  const label = displayNames.join(', ');

  return (
    <div className="flex items-center gap-2">
      <Avatar className="size-6">
        <AvatarFallback className="text-[10px]">
          {getInitials(displayNames[0])}
        </AvatarFallback>
      </Avatar>
      <span
        className="max-w-40 truncate text-xs text-slate-700"
        title={label}
      >
        {label}
      </span>
      {!compact && displayNames.length > 1 ? (
        <span className="badge-soft badge-neutral px-1.5 py-0 text-[10px]">
          +{displayNames.length - 1}
        </span>
      ) : null}
    </div>
  );
}

interface RowActionsProps {
  task: Task;
  onEdit: (task: Task) => void;
  onRequestDelete: (task: Task) => void;
}

function RowActions({ task, onEdit, onRequestDelete }: RowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={`Actions for ${task.taskTag}`}
        >
          <MoreHorizontalIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(task)}>
          <PencilIcon aria-hidden="true" />
          Edit details
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => onRequestDelete(task)}
        >
          <Trash2Icon aria-hidden="true" />
          Delete task
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
