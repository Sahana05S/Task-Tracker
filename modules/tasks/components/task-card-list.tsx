'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArchiveIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  ClockIcon,
  InfoIcon,
  MoreVerticalIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';

import { QuickLogTrigger } from '@/components/logs/quick-log-trigger';
import { AvatarStack, MissionProgress } from '@/components/missions/mission-ui';
import { StatusSelect } from '@/modules/tasks/components/status-select';
import {
  CategoryBadge,
  FreshnessIndicator,
  PriorityBadge,
} from '@/components/tracker/tracker-badges';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet';
import { EMPTY_EFFORT, type TaskEffort } from '@/lib/logs/metrics';
import { canUpdateTaskOwnFields } from '@/modules/tasks/internal/permissions';
import { CATEGORY_LABELS } from '@/shared/tracker/enums';
import { formatDate, formatNumeric, formatPercent, isOverdue, formatHours } from '@/shared/tracker/format';
import { cn } from '@/shared/utils';
import type { Task, User } from '@/types/tracker';

export interface TaskCardListProps {
  tasks: readonly Task[];
  memberNames: ReadonlyMap<string, string>;
  /** taskId to logged-hour totals, aggregated from `daily_task_logs`. */
  effortByTask: ReadonlyMap<string, TaskEffort>;
  currentUser: User;
  canManage: boolean;
  onEdit: (task: Task) => void;
  onRequestDelete: (task: Task) => void;
}

/**
 * Mission cards (Stitch reference missions_list_1): one column on phones, two
 * on tablets and three on wide screens.
 *
 * Card anatomy:
 *   chips    priority, type, archived; actions menu
 *   heading  task tag link, due date, title and description
 *   progress the task's stored 0–100 progress
 *   effort   hours logged, scaled progress, task productivity, freshness
 *   footer   assignees, status picker, Log hours, Open mission
 *
 * "Quick summary" in the actions menu opens a drawer with the remaining
 * columns (scale, reviewers, dates, eligibility) without leaving the list.
 */
export function TaskCardList({
  tasks,
  memberNames,
  effortByTask,
  currentUser,
  canManage,
  onEdit,
  onRequestDelete,
}: TaskCardListProps) {
  const [detailsTask, setDetailsTask] = React.useState<Task | null>(null);

  // Re-read the selected task from props so the drawer reflects edits made
  // while it is open, rather than the snapshot captured on tap.
  const activeTask = detailsTask
    ? (tasks.find((task) => task.id === detailsTask.id) ?? null)
    : null;

  return (
    <>
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tasks.map((task) => (
          <li key={task.id} className="flex">
            <MissionCard
              task={task}
              assigneeNames={namesForIds(task.assigneeIds, memberNames)}
              effort={effortByTask.get(task.id) ?? EMPTY_EFFORT}
              canEditOwnFields={canUpdateTaskOwnFields(currentUser, task)}
              canManage={canManage}
              onOpenDetails={() => setDetailsTask(task)}
              onEdit={() => onEdit(task)}
              onRequestDelete={() => onRequestDelete(task)}
            />
          </li>
        ))}
      </ul>

      <Sheet
        open={activeTask !== null}
        onOpenChange={(open) => {
          if (!open) setDetailsTask(null);
        }}
      >
        <SheetContent side="bottom" className="pb-8">
          {activeTask ? (
            <MissionSummary
              task={activeTask}
              effort={effortByTask.get(activeTask.id) ?? EMPTY_EFFORT}
              assigneeNames={namesForIds(activeTask.assigneeIds, memberNames)}
              reviewerNames={namesForIds(activeTask.reviewerIds, memberNames)}
              canManage={canManage}
              onEdit={() => {
                setDetailsTask(null);
                onEdit(activeTask);
              }}
              onRequestDelete={() => {
                setDetailsTask(null);
                onRequestDelete(activeTask);
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Card                                                                       */
/* -------------------------------------------------------------------------- */

interface MissionCardProps {
  task: Task;
  assigneeNames: readonly string[];
  effort: TaskEffort;
  canEditOwnFields: boolean;
  canManage: boolean;
  onOpenDetails: () => void;
  onEdit: () => void;
  onRequestDelete: () => void;
}

function MissionCard({
  task,
  assigneeNames,
  effort,
  canEditOwnFields,
  canManage,
  onOpenDetails,
  onEdit,
  onRequestDelete,
}: MissionCardProps) {
  const href = `/tasks/${encodeURIComponent(task.taskTag)}`;
  const archived = Boolean(task.archivedEffectiveDate);
  const closed = task.status === 'Done' || task.status === 'Discarded';
  const overdue = isOverdue(task.dueDate) && !closed;
  const canChange = canManage && !archived;

  return (
    <article className="soft-card-interactive flex w-full flex-col gap-4 p-5">
      {/* Chips and actions */}
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <PriorityBadge priority={task.priority} />
          <CategoryBadge category={task.category} />
          {archived ? (
            <span className="badge-soft badge-neutral">
              <ArchiveIcon className="size-3" aria-hidden="true" />
              Archived
            </span>
          ) : null}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-mt-1 -mr-2 size-8 shrink-0"
              aria-label={`Actions for ${task.taskTag}`}
            >
              <MoreVerticalIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onOpenDetails}>
              <InfoIcon aria-hidden="true" />
              Quick summary
            </DropdownMenuItem>
            {canChange ? (
              <>
                <DropdownMenuItem onSelect={onEdit}>
                  <PencilIcon aria-hidden="true" />
                  Edit details
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={onRequestDelete}>
                  <Trash2Icon aria-hidden="true" />
                  Delete mission
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Heading */}
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link href={href} className="task-tag text-primary hover:underline">
            {task.taskTag}
          </Link>
          {task.dueDate ? (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs',
                overdue ? 'font-semibold text-rose-700' : 'text-muted-foreground',
              )}
            >
              <CalendarDaysIcon className="size-3.5" aria-hidden="true" />
              Due {formatDate(task.dueDate)}
              {overdue ? ' · overdue' : ''}
            </span>
          ) : null}
        </div>
        <h3 className="text-foreground line-clamp-2 text-lg leading-snug font-bold tracking-tight">
          {task.title}
        </h3>
        {task.description ? (
          <p className="text-muted-foreground line-clamp-2 text-sm">{task.description}</p>
        ) : null}
      </div>

      {/* Progress */}
      <div className="mt-auto flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-foreground font-medium">Progress</span>
          <span className="text-success-strong font-bold tabular-nums">
            {formatPercent(task.progressPercentage)}
          </span>
        </div>
        <MissionProgress value={task.progressPercentage} label={`Progress for ${task.taskTag}`} />
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="tabular-nums">
            <ClockIcon className="mr-1 inline size-3 align-[-1px]" aria-hidden="true" />
            {formatHours(effort.hoursLogged)} h logged
          </span>
          <span className="tabular-nums">Scaled {formatNumeric(task.scaledProgress)}</span>
          <span className="tabular-nums">{formatNumeric(task.taskProductivity)} /h</span>
          <FreshnessIndicator freshness={task.freshness} className="ml-auto" />
        </div>
      </div>

      {/* Footer */}
      <div className="border-border flex flex-col gap-3 border-t pt-4">
        <AvatarStack names={assigneeNames} />
        <div className="flex flex-wrap items-center gap-2">
          <StatusSelect
            version={task.lifecycleVersion}
            taskId={task.id}
            taskTag={task.taskTag}
            status={task.status}
            canEdit={canEditOwnFields}
          />
          <div className="ml-auto flex items-center gap-2">
            {!archived && !closed ? (
              <QuickLogTrigger variant="button" label="Log hours" presetTaskId={task.id} />
            ) : null}
            <Button asChild size="sm">
              <Link href={href} aria-label={`Open mission ${task.taskTag}`}>
                Open
                <ArrowRightIcon aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* Summary drawer                                                             */
/* -------------------------------------------------------------------------- */

interface MissionSummaryProps {
  task: Task;
  effort: TaskEffort;
  assigneeNames: readonly string[];
  reviewerNames: readonly string[];
  canManage: boolean;
  onEdit: () => void;
  onRequestDelete: () => void;
}

function MissionSummary({
  task,
  effort,
  assigneeNames,
  reviewerNames,
  canManage,
  onEdit,
  onRequestDelete,
}: MissionSummaryProps) {
  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-2">
          <Link
            href={`/tasks/${encodeURIComponent(task.taskTag)}`}
            className="task-tag hover:underline"
          >
            {task.taskTag}
          </Link>
          <CategoryBadge category={task.category} />
          <FreshnessIndicator freshness={task.freshness} className="ml-auto" />
        </div>
        <SheetTitle className="pr-8">{task.title}</SheetTitle>
        <SheetDescription>{CATEGORY_LABELS[task.category]}</SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-4 overflow-y-auto px-4">
        {task.description ? (
          <p className="text-muted-foreground text-sm">{task.description}</p>
        ) : null}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Detail
            label="Assignees"
            value={
              assigneeNames.length > 0 ? assigneeNames.join(', ') : 'Unassigned'
            }
          />
          <Detail
            label="Reviewers"
            value={
              reviewerNames.length > 0 ? reviewerNames.join(', ') : '—'
            }
          />
          <Detail label="Priority" value={task.priority} />
          <Detail label="Status" value={task.archivedEffectiveDate?`${task.status} (archived, read-only)`:task.status} />
          <Detail label="Scale" value={formatNumeric(task.taskScale)} numeric />
          <Detail
            label="Progress"
            value={formatPercent(task.progressPercentage)}
            numeric
          />
          <Detail
            label="Scaled progress"
            value={formatNumeric(task.scaledProgress)}
            numeric
          />
          <Detail
            label="Hours logged"
            value={formatHours(effort.hoursLogged)}
            numeric
          />
          <Detail
            label="Log entries"
            value={String(effort.logCount)}
            numeric
          />
          <Detail
            label="Task productivity / h"
            value={formatNumeric(task.taskProductivity)}
            numeric
          />
          <Detail label="Assigned" value={formatDate(task.assignedDate)} />
          <Detail label="Due" value={formatDate(task.dueDate)} />
          <Detail label="Completed" value={formatDate(task.completedDate)} />
          <Detail
            label="Metrics eligible"
            value={task.validForMetrics ? 'Yes' : 'No'}
          />
        </dl>

        {task.comments ? (
          <div className="flex flex-col gap-1">
            <span className="eyebrow text-muted-foreground">Comments</span>
            <p className="text-muted-foreground text-sm">{task.comments}</p>
          </div>
        ) : null}

        <div className="flex gap-2 pt-2">
          <Button asChild size="sm" className="flex-1">
            <Link href={`/tasks/${encodeURIComponent(task.taskTag)}`}>
              Open mission
              <ArrowRightIcon aria-hidden="true" />
            </Link>
          </Button>
          {canManage && !task.archivedEffectiveDate ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={onEdit}>
                <PencilIcon aria-hidden="true" />
                Edit
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRequestDelete}
                className="border-rose-200 text-rose-700 hover:bg-rose-50"
              >
                <Trash2Icon aria-hidden="true" />
                Delete
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

function namesForIds(
  ids: readonly string[],
  memberNames: ReadonlyMap<string, string>,
): string[] {
  return ids.map((id) => memberNames.get(id) ?? 'Unknown');
}

function Detail({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {label}
      </dt>
      <dd className={cn('text-foreground text-sm', numeric && 'tabular-nums')}>
        {value}
      </dd>
    </div>
  );
}
