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
      <section className="soft-card px-6 py-10 text-center">
        <SparklesIcon
          className="text-muted-foreground mx-auto size-5"
          aria-hidden="true"
        />
        <h2 className="text-foreground mt-2 text-sm font-semibold">
          No star performer for {periodLabel}
        </h2>
        <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
          The award needs at least one member with logged hours. Once effort is
          recorded, the composite score decides it.
        </p>
      </section>
    );
  }

  const { starBreakdown: breakdown } = performer;

  return (
    <section aria-labelledby="star-performer-heading" className="soft-card-clip">
      {/* Banner */}
      <div className="bg-primary-subtle flex flex-wrap items-center gap-4 px-5 py-5 sm:px-6">
        <Avatar className="size-14 shrink-0">
          <AvatarFallback className="bg-primary text-primary-foreground text-base font-semibold">
            {getInitials(performer.fullName)}
          </AvatarFallback>
        </Avatar>

        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-primary flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase">
            <SparklesIcon className="size-3.5" aria-hidden="true" />
            Star performer · {periodLabel}
          </span>
          <h2
            id="star-performer-heading"
            className="text-foreground truncate text-xl font-bold tracking-tight"
          >
            {performer.fullName}
          </h2>
          <span className="flex flex-wrap items-center gap-2">
            <RoleBadge role={performer.role} />
            <span className="text-muted-foreground text-xs">
              {performer.employeeId}
            </span>
          </span>
        </div>

        <div className="ml-auto flex flex-col items-end">
          <span className="stat-label">Composite score</span>
          <span className="stat-figure text-primary">
            {formatNumeric(performer.starScore)}
          </span>
        </div>
      </div>

      {/* Headline figures */}
      <dl className="divide-border border-border grid grid-cols-2 border-b sm:grid-cols-4 sm:divide-x">
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
      <div className="px-5 py-4 sm:px-6">
        <h3 className="eyebrow">How the score was reached</h3>
        <ul className="text-muted-foreground mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
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
          <p className="text-muted-foreground mt-2.5 text-xs">
            Team median productivity is{' '}
            <span className="text-foreground font-semibold [font-variant-numeric:tabular-nums]">
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
    <div className="flex flex-col gap-1 px-5 py-4 sm:px-6">
      <dt className="stat-label">{label}</dt>
      <dd className="text-foreground text-lg font-bold tracking-tight [font-variant-numeric:tabular-nums]">
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
    <li className="soft-inset flex items-center gap-1.5 px-2.5 py-1">
      <span>{label}</span>
      <span
        className={cn(
          'font-semibold [font-variant-numeric:tabular-nums]',
          value >= 0 ? 'text-foreground' : 'text-rose-700',
        )}
      >
        {value >= 0 ? '+' : ''}
        {formatNumeric(value)}
      </span>
    </li>
  );
}
