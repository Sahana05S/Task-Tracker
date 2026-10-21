'use client';

import * as React from 'react';
import Link from 'next/link';

import { checklistWorkHref } from '@/modules/checklists/client';
import {
  ArchiveIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  ClockIcon,
  ListChecksIcon,
  MoreVerticalIcon,
} from 'lucide-react';

import { AvatarStack, MissionProgress } from '@/shared/ui/mission-ui';
import { StatusSelect } from '@/modules/tasks/components/status-select';
import { TaskRowMenuItems, type TaskRowActions } from '@/modules/tasks/components/task-row-menu';
import {
  CategoryBadge,
  FreshnessIndicator,
  PriorityBadge,
} from '@/shared/ui/tracker-badges';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { EMPTY_EFFORT, type TaskEffort } from '@/modules/tasks/internal/effort';
import { canUpdateTaskOwnFields, isAssignedToTask } from '@/modules/tasks/internal/permissions';
import { formatDate, formatPercent, isOverdue, formatHours } from '@/shared/tracker/format';
import { cn } from '@/shared/utils';
import type { Task, User } from '@/types/tracker';

export interface TaskCardListProps {
  tasks: readonly Task[];
  memberNames: ReadonlyMap<string, string>;
  /** taskId to logged-hour totals, aggregated from `daily_task_logs`. */
  effortByTask: ReadonlyMap<string, TaskEffort>;
  currentUser: User;
  canManage: boolean;
  /** Row-menu actions, handled by the Missions shell. */
  actions: TaskRowActions;
  /**
   * The "Log hours" button for an open mission. Supplied by the page that
   * composes this list with time tracking, so tasks does not depend on it.
   */
  LogHoursAction?: LogHoursActionComponent;
}

/** A time-tracking control for one task (the tag gives it a unique accessible name). */
export type LogHoursActionComponent = React.ComponentType<{ taskId: string; taskTag: string }>;

/**
 * Mission cards (Stitch reference missions_list_1): one column on phones, two
 * on tablets and three on wide screens.
 *
 * Card anatomy:
 *   chips    priority, type, archived; actions menu
 *   heading  task tag link, due date, title and description
 *   progress the task's stored 0–100 progress, hours logged, freshness
 *   footer   assignees, status picker, Log hours, Master checklist, Open
 *
 * The actions menu carries Quick summary (the remaining columns in a sheet)
 * and the single-mission Task Tools actions; there is no select mode on cards.
 */
export const TaskCardList = React.memo(function TaskCardList({
  tasks,
  memberNames,
  effortByTask,
  currentUser,
  canManage,
  actions,
  LogHoursAction,
}: TaskCardListProps) {
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {tasks.map((task) => (
        <li key={task.id} className="flex">
          <MissionCard
            task={task}
            assigneeNames={task.assigneeIds.map((id) => memberNames.get(id) ?? 'Unknown')}
            effort={effortByTask.get(task.id) ?? EMPTY_EFFORT}
            canEditOwnFields={canUpdateTaskOwnFields(currentUser, task)}
            isAssignee={isAssignedToTask(task, currentUser.id)}
            canManage={canManage}
            actions={actions}
            LogHoursAction={LogHoursAction}
          />
        </li>
      ))}
    </ul>
  );
});

/* -------------------------------------------------------------------------- */
/* Card                                                                       */
/* -------------------------------------------------------------------------- */

interface MissionCardProps {
  task: Task;
  assigneeNames: readonly string[];
  effort: TaskEffort;
  canEditOwnFields: boolean;
  /** Only assignees can time a mission; the database refuses anyone else. */
  isAssignee: boolean;
  canManage: boolean;
  actions: TaskRowActions;
  LogHoursAction?: LogHoursActionComponent;
}

function MissionCard({
  task,
  assigneeNames,
  effort,
  canEditOwnFields,
  isAssignee,
  canManage,
  actions,
  LogHoursAction,
}: MissionCardProps) {
  const href = `/tasks/${encodeURIComponent(task.taskTag)}`;
  const archived = Boolean(task.archivedEffectiveDate);
  const closed = task.status === 'Done' || task.status === 'Discarded';
  const overdue = isOverdue(task.dueDate) && !closed;

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
              className="-mt-1 -mr-2 size-10 shrink-0"
              aria-label={`Actions for ${task.taskTag}`}
            >
              <MoreVerticalIcon aria-hidden="true" />
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
                overdue ? 'text-overdue font-semibold' : 'text-muted-foreground',
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
          <span className="text-foreground font-bold tabular-nums">
            {formatPercent(task.progressPercentage)}
          </span>
        </div>
        <MissionProgress value={task.progressPercentage} label={`Progress for ${task.taskTag}`} />
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="tabular-nums">
            <ClockIcon className="mr-1 inline size-3 align-[-1px]" aria-hidden="true" />
            {formatHours(effort.hoursLogged)} h logged
          </span>
          <FreshnessIndicator freshness={task.freshness} className="ml-auto" />
        </div>
      </div>

      {/* Footer */}
      <div className="border-border flex flex-col gap-3 border-t pt-4">
        <div className="flex items-center justify-between gap-2">
          <AvatarStack names={assigneeNames} />
          <Link
            href={checklistWorkHref(task.taskTag)}
            className="link inline-flex items-center gap-1 text-xs"
            aria-label={`Master checklist for ${task.taskTag}`}
          >
            <ListChecksIcon className="size-3.5" aria-hidden="true" />
            Master checklist
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusSelect
            version={task.lifecycleVersion}
            taskId={task.id}
            taskTag={task.taskTag}
            status={task.status}
            canEdit={canEditOwnFields}
          />
          <div className="ml-auto flex items-center gap-2">
            {isAssignee && !archived && !closed && LogHoursAction ? <LogHoursAction taskId={task.id} taskTag={task.taskTag} /> : null}
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
