'use client';

import Link from 'next/link';

import { checklistWorkHref } from '@/modules/checklists/client';
import { ArrowRightIcon, PencilIcon, Trash2Icon } from 'lucide-react';

import { CategoryBadge, FreshnessIndicator } from '@/shared/ui/tracker-badges';
import { Button } from '@/shared/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet';
import { EMPTY_EFFORT, type TaskEffort } from '@/modules/tasks/internal/effort';
import { useCategoryLabels } from '@/modules/settings/components/company-settings-context';
import { formatDate, formatHours, formatNumeric, formatPercent } from '@/shared/tracker/format';
import { cn } from '@/shared/utils';
import type { Task } from '@/types/tracker';

export interface MissionSummarySheetProps {
  /** The mission to summarise; null keeps the sheet closed. */
  task: Task | null;
  effortByTask: ReadonlyMap<string, TaskEffort>;
  memberNames: ReadonlyMap<string, string>;
  canManage: boolean;
  onClose: () => void;
  onEdit: (task: Task) => void;
  onRequestDelete: (task: Task) => void;
}

/**
 * "Quick summary" from a row menu, in the table and the cards: the columns
 * the list leaves out (scale, reviewers, dates, deadline, eligibility,
 * comments) without leaving the page.
 */
export function MissionSummarySheet({
  task,
  effortByTask,
  memberNames,
  canManage,
  onClose,
  onEdit,
  onRequestDelete,
}: MissionSummarySheetProps) {
  return (
    <Sheet open={task !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="bottom" className="pb-8 sm:mx-auto sm:max-w-2xl">
        {task ? (
          <MissionSummary
            task={task}
            effort={effortByTask.get(task.id) ?? EMPTY_EFFORT}
            memberNames={memberNames}
            canManage={canManage}
            onEdit={() => {
              onClose();
              onEdit(task);
            }}
            onRequestDelete={() => {
              onClose();
              onRequestDelete(task);
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function MissionSummary({
  task,
  effort,
  memberNames,
  canManage,
  onEdit,
  onRequestDelete,
}: {
  task: Task;
  effort: TaskEffort;
  memberNames: ReadonlyMap<string, string>;
  canManage: boolean;
  onEdit: () => void;
  onRequestDelete: () => void;
}) {
  const categoryLabels = useCategoryLabels();
  const href = `/tasks/${encodeURIComponent(task.taskTag)}`;
  const names = (ids: readonly string[], none: string) =>
    ids.length > 0 ? ids.map((id) => memberNames.get(id) ?? 'Unknown').join(', ') : none;
  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-2">
          <Link href={href} className="task-tag hover:underline">
            {task.taskTag}
          </Link>
          <CategoryBadge category={task.category} />
          <FreshnessIndicator freshness={task.freshness} className="ml-auto" />
        </div>
        <SheetTitle className="pr-8">{task.title}</SheetTitle>
        <SheetDescription>{categoryLabels[task.category]}</SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-4 overflow-y-auto px-4">
        {task.description ? (
          <p className="text-muted-foreground text-sm">{task.description}</p>
        ) : null}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Detail label="Assignees" value={names(task.assigneeIds, 'Unassigned')} />
          <Detail label="Reviewers" value={names(task.reviewerIds, '—')} />
          <Detail label="Priority" value={task.priority} />
          <Detail label="Status" value={task.archivedEffectiveDate ? `${task.status} (archived, read-only)` : task.status} />
          <Detail label="Scale" value={formatNumeric(task.taskScale)} numeric />
          <Detail label="Progress" value={formatPercent(task.progressPercentage)} numeric />
          <Detail label="Scaled progress" value={formatNumeric(task.scaledProgress)} numeric />
          <Detail label="Hours logged" value={formatHours(effort.hoursLogged)} numeric />
          <Detail label="Log entries" value={String(effort.logCount)} numeric />
          <Detail label="Task productivity / h" value={formatNumeric(task.taskProductivity)} numeric />
          <Detail label="Assigned" value={formatDate(task.assignedDate)} />
          <Detail label="Due" value={formatDate(task.dueDate)} />
          <Detail label="Completed" value={formatDate(task.completedDate)} />
          <Detail label="Met deadline" value={task.metDeadline === null ? '—' : task.metDeadline ? 'Yes' : 'No'} />
          <Detail label="Metrics eligible" value={task.validForMetrics ? 'Yes' : 'No'} />
        </dl>

        {task.comments ? (
          <div className="flex flex-col gap-1">
            <span className="eyebrow">Comments</span>
            <p className="text-muted-foreground text-sm">{task.comments}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button asChild size="sm" className="flex-1">
            <Link href={href}>
              Open mission
              <ArrowRightIcon aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={checklistWorkHref(task.taskTag)}>Master checklist</Link>
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
                className="border-danger-border text-danger hover:bg-danger-subtle"
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

function Detail({ label, value, numeric = false }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{label}</dt>
      <dd className={cn('text-foreground text-sm', numeric && 'tabular-nums')}>{value}</dd>
    </div>
  );
}
