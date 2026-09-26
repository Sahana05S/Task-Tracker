import * as React from 'react';
import { CheckIcon, CircleDashedIcon, CircleDotIcon } from 'lucide-react';

import {
  MONTHLY_MILESTONES,
  type Milestone,
  type MilestoneStatus,
} from '@/lib/milestones/content';
import { toProgressValue } from '@/lib/tracker/format';
import { cn } from '@/lib/utils';

export interface MilestoneChecklistProps {
  milestones?: readonly Milestone[];
  /** Label for the tracking period, e.g. "September 2026". */
  periodLabel: string;
}

/**
 * Monthly goals and milestones.
 *
 * Reuses the soft-tint status classes from `responsive-ui-design.md` rather than
 * introducing a parallel palette: Planned, In Progress and Achieved map onto the
 * same three states the task grid already uses, so the colours mean the same
 * thing in both places.
 *
 * Read-only. The content is static, so there is no row to toggle; making these
 * checkable needs a `milestones` table and its own RLS policies.
 */
const STATUS_CLASSES = {
  Planned: 'badge-status-not-started',
  'In Progress': 'badge-status-in-progress',
  Achieved: 'badge-status-done',
} satisfies Record<MilestoneStatus, string>;

const STATUS_ICONS = {
  Planned: CircleDashedIcon,
  'In Progress': CircleDotIcon,
  Achieved: CheckIcon,
} satisfies Record<MilestoneStatus, React.ComponentType<{ className?: string }>>;

export function MilestoneChecklist({
  milestones = MONTHLY_MILESTONES,
  periodLabel,
}: MilestoneChecklistProps) {
  const achieved = milestones.filter((m) => m.status === 'Achieved').length;
  const inProgress = milestones.filter((m) => m.status === 'In Progress').length;

  return (
    <section
      aria-labelledby="milestones-heading"
      className="soft-card flex flex-col gap-4 p-5"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3
            id="milestones-heading"
            className="text-sm font-semibold text-slate-900"
          >
            Monthly goals &amp; milestones
          </h3>
          <p className="text-xs text-slate-500">{periodLabel}</p>
        </div>
        <p className="text-xs text-slate-500 tabular">
          {achieved} achieved · {inProgress} in progress · {milestones.length}{' '}
          total
        </p>
      </header>

      <ul className="flex flex-col divide-y divide-slate-100">
        {milestones.map((milestone) => (
          <li key={milestone.id} className="flex items-start gap-3 py-3">
            <StatusMarker status={milestone.status} title={milestone.title} />

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-900">
                  {milestone.title}
                </span>
                <span
                  className={cn('badge-soft', STATUS_CLASSES[milestone.status])}
                >
                  {milestone.status}
                </span>
              </div>

              <p className="text-sm text-slate-600">{milestone.description}</p>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>Owner: {milestone.owner}</span>
                {milestone.target !== undefined ? (
                  <span className="tabular">
                    {milestone.completed ?? 0} of {milestone.target} delivered
                  </span>
                ) : null}
              </div>

              {milestone.target !== undefined && milestone.target > 0 ? (
                <progress
                  className="task-progress mt-0.5 max-w-64"
                  value={toProgressValue(
                    ((milestone.completed ?? 0) / milestone.target) * 100,
                  )}
                  max={100}
                  data-complete={
                    (milestone.completed ?? 0) >= milestone.target
                      ? 'true'
                      : 'false'
                  }
                  aria-label={`${milestone.title} progress`}
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusMarker({
  status,
  title,
}: {
  status: MilestoneStatus;
  title: string;
}) {
  const Icon = STATUS_ICONS[status];

  return (
    <span
      className={cn(
        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full',
        // Marker hues track the status pills: emerald done, amber in flight,
        // neutral not started.
        status === 'Achieved'
          ? 'bg-emerald-100 text-emerald-700'
          : status === 'In Progress'
            ? 'bg-amber-100 text-amber-700'
            : 'bg-muted text-slate-400',
      )}
    >
      <Icon className="size-3" />
      <span className="sr-only">
        {title}: {status}
      </span>
    </span>
  );
}
