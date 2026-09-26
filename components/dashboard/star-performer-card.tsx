import * as React from 'react';
import { SparklesIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react';

import { RoleBadge } from '@/components/tracker/tracker-badges';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { STAR_WEIGHTS, type MemberPerformance } from '@/lib/analytics/engine';
import { formatNumeric } from '@/lib/tracker/format';
import { cn, getInitials } from '@/lib/utils';

export interface StarPerformerCardProps {
  performer: MemberPerformance | null;
  periodLabel: string;
  /** Team median productivity, for context on the differential. */
  medianProductivity: number | null;
}

/**
 * Star Performer of the Month banner.
 *
 * Shows the winning member alongside the four terms that produced their
 * composite score. The breakdown is deliberate: the weighted formula from
 * `domain-rules.md` mixes quantities of very different magnitudes, and printing
 * the contributions lets a reader see which one actually decided the month
 * instead of taking the total on faith.
 */
export function StarPerformerCard({
  performer,
  periodLabel,
  medianProductivity,
}: StarPerformerCardProps) {
  if (!performer) {
    return (
      <section className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-8 text-center">
        <SparklesIcon
          className="mx-auto size-5 text-slate-400"
          aria-hidden="true"
        />
        <h2 className="mt-2 text-sm font-medium text-slate-900">
          No star performer for {periodLabel}
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          The award needs at least one member with logged hours. Once effort is
          recorded, the composite score decides it.
        </p>
      </section>
    );
  }

  const { starBreakdown: breakdown } = performer;

  return (
    <section
      aria-labelledby="star-performer-heading"
      className="overflow-hidden rounded-lg border border-slate-200 bg-white"
    >
      {/* Banner */}
      <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 bg-slate-100 px-4 py-4 sm:px-6">
        <Avatar className="size-12 shrink-0">
          <AvatarFallback className="bg-slate-900 text-sm text-slate-50">
            {getInitials(performer.fullName)}
          </AvatarFallback>
        </Avatar>

        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-amber-700 uppercase">
            <SparklesIcon className="size-3.5" aria-hidden="true" />
            Star performer · {periodLabel}
          </span>
          <h2
            id="star-performer-heading"
            className="truncate text-lg font-semibold text-slate-900"
          >
            {performer.fullName}
          </h2>
          <span className="flex flex-wrap items-center gap-2">
            <RoleBadge role={performer.role} />
            <span className="text-xs text-slate-500">
              {performer.employeeId}
            </span>
          </span>
        </div>

        <div className="ml-auto flex flex-col items-end">
          <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">
            Composite score
          </span>
          <span className="text-2xl font-semibold text-slate-900 [font-variant-numeric:tabular-nums]">
            {formatNumeric(performer.starScore)}
          </span>
        </div>
      </div>

      {/* Headline figures */}
      <dl className="grid grid-cols-2 divide-slate-200 border-b border-slate-200 sm:grid-cols-4 sm:divide-x">
        <Figure
          label="Scaled progress"
          value={formatNumeric(performer.scaledProgress)}
        />
        <Figure
          label="Productivity"
          value={
            performer.productivity === null
              ? '\u2014'
              : `${formatNumeric(performer.productivity)} /h`
          }
          delta={performer.productivityDiff}
          deltaSuffix=" vs median"
        />
        <Figure
          label="Hours logged"
          value={formatNumeric(performer.hoursLogged)}
        />
        <Figure
          label="Allocation"
          value={`${formatNumeric(performer.allocationPercent)}%`}
          delta={performer.loadingDiff}
          deltaSuffix=" vs median"
        />
      </dl>

      {/* Score composition */}
      <div className="px-4 py-3 sm:px-6">
        <h3 className="text-xs font-medium tracking-wide text-slate-500 uppercase">
          How the score was reached
        </h3>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600">
          <Term
            label={`Productivity differential × ${STAR_WEIGHTS.productivityDiff}`}
            value={breakdown.productivityDiff}
          />
          <Term
            label={`Scaled progress × ${STAR_WEIGHTS.scaledProgress}`}
            value={breakdown.scaledProgress}
          />
          <Term
            label={`Freshness × ${STAR_WEIGHTS.freshnessScore}`}
            value={breakdown.freshnessScore}
          />
          <Term
            label={`Rotten tasks × ${STAR_WEIGHTS.rottenCount}`}
            value={-breakdown.rottenPenalty}
          />
        </ul>
        {medianProductivity !== null ? (
          <p className="mt-2 text-xs text-slate-500">
            Team median productivity is{' '}
            <span className="font-medium text-slate-700 [font-variant-numeric:tabular-nums]">
              {formatNumeric(medianProductivity)}
            </span>{' '}
            scaled progress per hour.
          </p>
        ) : null}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

interface FigureProps {
  label: string;
  value: string;
  delta?: number | null;
  deltaSuffix?: string;
}

function Figure({ label, value, delta, deltaSuffix = '' }: FigureProps) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 sm:px-6">
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
        {label}
      </dt>
      <dd className="text-base font-semibold text-slate-900 [font-variant-numeric:tabular-nums]">
        {value}
      </dd>
      {delta !== undefined && delta !== null ? (
        <dd
          className={cn(
            'flex items-center gap-1 text-xs font-medium [font-variant-numeric:tabular-nums]',
            delta >= 0 ? 'text-emerald-700' : 'text-rose-700',
          )}
        >
          {delta >= 0 ? (
            <TrendingUpIcon className="size-3" aria-hidden="true" />
          ) : (
            <TrendingDownIcon className="size-3" aria-hidden="true" />
          )}
          {delta >= 0 ? '+' : ''}
          {formatNumeric(delta)}
          {deltaSuffix}
        </dd>
      ) : null}
    </div>
  );
}

function Term({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex items-center gap-1.5">
      <span>{label}</span>
      <span
        className={cn(
          'font-medium [font-variant-numeric:tabular-nums]',
          value >= 0 ? 'text-slate-900' : 'text-rose-700',
        )}
      >
        {value >= 0 ? '+' : ''}
        {formatNumeric(value)}
      </span>
    </li>
  );
}
