'use client';

import * as React from 'react';
import { ClockIcon, PencilIcon, Trash2Icon } from 'lucide-react';

import { QuickLogTrigger } from '@/components/logs/quick-log-trigger';
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { EMPTY_EFFORT, type TaskEffort } from '@/lib/logs/metrics';
import { CATEGORY_LABELS } from '@/lib/tracker/enums';
import {
  formatDate,
  formatNumeric,
  formatPercent,
  isOverdue,
  toProgressValue,
} from '@/lib/tracker/format';
import { cn, getInitials } from '@/lib/utils';
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
 * Stacked card view for narrow viewports.
 *
 * Card anatomy follows the mobile section of `responsive-ui-design.md`:
 *   header  task tag, category badge, freshness indicator
 *   body    title, assignee avatar, progress bar with percentage
 *   footer  status picker, Quick Log button
 *
 * Tapping the body opens a details drawer, which is where the columns the card
 * cannot fit — scale, scaled progress, reviewer, dates — are shown.
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
      <ul className="flex flex-col gap-2">
        {tasks.map((task) => (
          <li key={task.id}>
            <TaskCard
              task={task}
              assigneeName={memberNames.get(task.assigneeId) ?? 'Unassigned'}
              effort={effortByTask.get(task.id) ?? EMPTY_EFFORT}
              canEditOwnFields={canManage || task.assigneeId === currentUser.id}
              onOpenDetails={() => setDetailsTask(task)}
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
            <TaskDetails
              task={activeTask}
              effort={effortByTask.get(activeTask.id) ?? EMPTY_EFFORT}
              assigneeName={
                memberNames.get(activeTask.assigneeId) ?? 'Unassigned'
              }
              reviewerName={
                activeTask.reviewerId
                  ? (memberNames.get(activeTask.reviewerId) ?? 'Unknown')
                  : null
              }
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

interface TaskCardProps {
  task: Task;
  assigneeName: string;
  effort: TaskEffort;
  canEditOwnFields: boolean;
  onOpenDetails: () => void;
}

function TaskCard({
  task,
  assigneeName,
  effort,
  canEditOwnFields,
  onOpenDetails,
}: TaskCardProps) {
  const progress = toProgressValue(task.progressPercentage);
  const overdue =
    isOverdue(task.dueDate) &&
    task.status !== 'Done' &&
    task.status !== 'Discarded';

  return (
    <article className="soft-card-interactive flex flex-col">
      {/* Header */}
      <div className="border-border flex items-center gap-2 border-b px-4 py-2.5">
        <span className="task-tag">{task.taskTag}</span>
        <CategoryBadge category={task.category} />
        <FreshnessIndicator freshness={task.freshness} className="ml-auto" />
      </div>

      {/* Body. A button so the whole region is one keyboard-reachable target. */}
      <button
        type="button"
        onClick={onOpenDetails}
        aria-label={`Open details for ${task.taskTag}`}
        className="hover:bg-muted focus-visible:ring-primary/30 flex flex-col gap-2.5 px-4 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <span className="text-foreground text-sm font-semibold">
          {task.title}
        </span>

        <span className="flex items-center gap-2">
          <Avatar className="size-5">
            <AvatarFallback className="text-[9px]">
              {getInitials(assigneeName)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-xs text-slate-500">
            {assigneeName}
          </span>
          <PriorityBadge priority={task.priority} className="ml-auto" />
        </span>

        <span className="flex items-center gap-2">
          <progress
            className="task-progress"
            value={progress}
            max={100}
            data-complete={progress >= 100 ? 'true' : 'false'}
            aria-label={`Progress for ${task.taskTag}`}
          />
          <span className="badge-soft badge-neutral shrink-0 tabular">
            {formatPercent(task.progressPercentage)}
          </span>
        </span>

        {/* Live effort figures. Hours come from the log aggregate; the rate is
            the stored task_productivity the log actions maintain. */}
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="tabular">
            <ClockIcon
              className="mr-1 inline size-3 align-[-1px]"
              aria-hidden="true"
            />
            {formatNumeric(effort.hoursLogged)} h logged
          </span>
          <span className="tabular">
            Scaled {formatNumeric(task.scaledProgress)}
          </span>
          <span className="tabular">
            {formatNumeric(task.taskProductivity)} /h
          </span>
        </span>

        {task.dueDate ? (
          <span
            className={cn(
              'text-xs',
              overdue ? 'font-medium text-rose-700' : 'text-slate-500',
            )}
          >
            Due {formatDate(task.dueDate)}
            {overdue ? ' · overdue' : ''}
          </span>
        ) : null}
      </button>

      {/* Footer */}
      <div className="border-border flex items-center gap-2 border-t px-4 py-2.5">
        <StatusSelect
          taskId={task.id}
          taskTag={task.taskTag}
          status={task.status}
          canEdit={canEditOwnFields}
        />

        <QuickLogTrigger
          variant="button"
          label="Quick Log"
          presetTaskId={task.id}
          className="ml-auto"
        />
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* Details drawer                                                             */
/* -------------------------------------------------------------------------- */

interface TaskDetailsProps {
  task: Task;
  effort: TaskEffort;
  assigneeName: string;
  reviewerName: string | null;
  canManage: boolean;
  onEdit: () => void;
  onRequestDelete: () => void;
}

function TaskDetails({
  task,
  effort,
  assigneeName,
  reviewerName,
  canManage,
  onEdit,
  onRequestDelete,
}: TaskDetailsProps) {
  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-2">
          <span className="task-tag">{task.taskTag}</span>
          <CategoryBadge category={task.category} />
          <FreshnessIndicator freshness={task.freshness} className="ml-auto" />
        </div>
        <SheetTitle className="pr-8">{task.title}</SheetTitle>
        <SheetDescription>{CATEGORY_LABELS[task.category]}</SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-4 overflow-y-auto px-4">
        {task.description ? (
          <p className="text-sm text-slate-600">{task.description}</p>
        ) : null}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Detail label="Assignee" value={assigneeName} />
          <Detail label="Reviewer" value={reviewerName ?? '\u2014'} />
          <Detail label="Priority" value={task.priority} />
          <Detail label="Status" value={task.status} />
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
            value={formatNumeric(effort.hoursLogged)}
            numeric
          />
          <Detail
            label="Log entries"
            value={String(effort.logCount)}
            numeric
          />
          <Detail
            label="Productivity / h"
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
            <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">
              Comments
            </span>
            <p className="text-sm text-slate-600">{task.comments}</p>
          </div>
        ) : null}

        {canManage ? (
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onEdit}
              className="flex-1"
            >
              <PencilIcon aria-hidden="true" />
              Edit
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRequestDelete}
              className="flex-1 border-rose-200 text-rose-700 hover:bg-rose-50"
            >
              <Trash2Icon aria-hidden="true" />
              Delete
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
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
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          'text-sm text-slate-900',
          numeric && 'tabular',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
