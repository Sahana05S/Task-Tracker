import * as React from 'react';
import { PlusIcon, FlagIcon } from 'lucide-react';
import { MissionProgress } from '@/components/missions/mission-ui';

import { Button } from '@/shared/ui/button';
import {
  milestoneCompletion,
  summariseMilestones,
} from '@/lib/milestones/goals';
import { formatDate, isOverdue, toProgressValue } from '@/shared/tracker/format';
import { cn } from '@/shared/utils';
import type { CompanyMilestone, MilestoneStatus } from '@/types/tracker';

export interface MilestoneChecklistProps {
  /** Already ordered by the caller; this component does not re-sort. */
  milestones: readonly CompanyMilestone[];
  /** Resolves `owner_id` to a display name. */
  ownerNames: ReadonlyMap<string, string>;
  /** Label for the tracking period, e.g. "September 2026". */
  periodLabel: string;
  canManage: boolean;
  onAdd: () => void;
  onEdit: (milestone: CompanyMilestone) => void;
  onRequestDelete: (milestone: CompanyMilestone) => void;
}

/**
 * Monthly goals and milestones.
 *
 * Status tints are the same three classes the task grid uses — Planned reads as
 * Not Started, In Progress as In Progress, Achieved as Done — so a colour means
 * the same thing on both pages rather than introducing a parallel palette.
 *
 * Presentational. The board above it owns the editing state, which keeps the
 * list a pure function of its props.
 */
const STATUS_CLASSES = {
  Planned: 'badge-status-not-started',
  'In Progress': 'badge-status-in-progress',
  Achieved: 'badge-status-done',
} satisfies Record<MilestoneStatus, string>;

export function MilestoneChecklist({
  milestones,
  ownerNames,
  periodLabel,
  canManage,
  onAdd,
  onEdit,
  onRequestDelete,
}: MilestoneChecklistProps) {
  const summary = summariseMilestones(milestones);

  return (
    <section
      aria-labelledby="milestones-heading"
      className="soft-card flex flex-col gap-4 p-5 sm:p-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3
            id="milestones-heading"
            className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight"
          >
            <FlagIcon className="text-primary size-5 shrink-0" aria-hidden="true" />
            Monthly goals &amp; milestones
          </h3>
          <p className="text-muted-foreground text-xs">
            {periodLabel} ·{' '}
            <span className="tabular">{summary.achieved}</span> achieved ·{' '}
            <span className="tabular">{summary.inProgress}</span> in progress ·{' '}
            <span className="tabular">{summary.total}</span> total
          </p>
        </div>

        {canManage ? (
          <Button type="button" size="sm" onClick={onAdd}>
            <PlusIcon aria-hidden="true" />
            Add milestone
          </Button>
        ) : null}
      </header>

      {milestones.length === 0 ? (
        <p className="bg-muted/70 text-muted-foreground rounded-xl px-4 py-6 text-center text-sm">
          {canManage
            ? 'No milestones yet. Add the first outcome the team is aiming at this month.'
            : 'No milestones have been set for this period yet.'}
        </p>
      ) : (
        <ul className="divide-border flex flex-col divide-y">
          {milestones.map((milestone) => (
            <MilestoneRow
              key={milestone.id}
              milestone={milestone}
              ownerName={
                milestone.ownerId === null
                  ? null
                  : ownerNames.get(milestone.ownerId) ?? 'Former member'
              }
              canManage={canManage}
              onEdit={onEdit}
              onRequestDelete={onRequestDelete}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Row                                                                        */
/* -------------------------------------------------------------------------- */

interface MilestoneRowProps {
  milestone: CompanyMilestone;
  /** `null` means the milestone is carried by the whole team. */
  ownerName: string | null;
  canManage: boolean;
  onEdit: (milestone: CompanyMilestone) => void;
  onRequestDelete: (milestone: CompanyMilestone) => void;
}

function MilestoneRow({
  milestone,
  ownerName,
  canManage,
  onEdit,
  onRequestDelete,
}: MilestoneRowProps) {
  const completion = milestoneCompletion(milestone);
  // A passed deadline only matters while the goal is still open.
  const overdue =
    milestone.status !== 'Achieved' && isOverdue(milestone.dueDate);

  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-foreground text-sm font-semibold">
            {milestone.title}
          </span>
          <span className={cn('badge-soft', STATUS_CLASSES[milestone.status])}>
            {milestone.status}
          </span>
        </div>

        {milestone.description ? (
          <p className="text-muted-foreground text-[13px]">
            {milestone.description}
          </p>
        ) : null}

        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span>Owner: {ownerName ?? 'Whole team'}</span>

          {milestone.targetCount !== null ? (
            <span className="tabular">
              {milestone.deliveredCount} of {milestone.targetCount} delivered
            </span>
          ) : milestone.deliveredCount > 0 ? (
            <span className="tabular">
              {milestone.deliveredCount} delivered
            </span>
          ) : null}

          {milestone.dueDate ? (
            <span
              className={cn(
                'tabular',
                overdue && 'font-semibold text-rose-700',
              )}
            >
              Due {formatDate(milestone.dueDate)}
              {overdue ? ' · overdue' : ''}
            </span>
          ) : null}
        </div>

        {completion !== null ? (
          <MissionProgress
            className="mt-1 max-w-64"
            value={toProgressValue(completion)}
            label={`${milestone.title} progress`}
          />
        ) : null}
      </div>

      {canManage ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onEdit(milestone)}
            className="h-7 px-2 text-xs"
          >
            Edit
            <span className="sr-only"> {milestone.title}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRequestDelete(milestone)}
            className="h-7 px-2 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          >
            Delete
            <span className="sr-only"> {milestone.title}</span>
          </Button>
        </div>
      ) : null}
    </li>
  );
}
