import * as React from 'react';

import { RoleBadge } from '@/components/tracker/tracker-badges';
import { STAR_WEIGHTS, type MemberPerformance } from '@/lib/analytics/engine';
import { formatNumeric } from '@/lib/tracker/format';
import { cn } from '@/lib/utils';

export interface StarPerformerCardProps {
  performer: MemberPerformance | null;
  periodLabel: string;
  /** Team median productivity, for context on the differential. */
  medianProductivity: number | null;
}

/**
 * Star performer of the month.
 *
 * Shows the winning member alongside the four terms that produced their composite
 * score. The breakdown is deliberate: the weighted formula from `domain-rules.md`
 * mixes quantities of very different magnitudes, and printing the contributions
 * lets a reader see which one actually decided the month instead of taking the
 * total on faith.
 *
 * Initials rather than an avatar image, and no ornament — the member's name is the
 * point, and a decorative glyph beside it adds nothing a reader needs.
 */
export function StarPerformerCard({
  performer,
  periodLabel,
  medianProductivity,
}: StarPerformerCardProps) {
  if (!performer) {
    return (
      <section className="soft-card px-4 py-6">
        <h2 className="text-foreground text-sm font-semibold">
          No star performer for {periodLabel}
        </h2>
        <p className="text-muted-foreground mt-1 max-w-xl text-xs">
          The award needs at least one member with logged hours. Once effort is
          recorded, the composite score decides it.
        </p>
      </section>
    );
  }

  const { starBreakdown: breakdown } = performer;

  return (
    <section aria-labelledby="star-performer-heading" className="soft-card-clip">
      {/* Identity and score */}
      <div className="bg-primary-subtle flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-md font-mono text-xs font-semibold">
          {initialsOf(performer.fullName)}
        </span>

        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-primary text-[10px] font-semibold tracking-[0.12em] uppercase">
            Star performer · {periodLabel}
          </span>
          <h2
            id="star-performer-heading"
            className="text-foreground truncate text-base font-semibold tracking-tight"
          >
            {performer.fullName}
          </h2>
          <span className="flex flex-wrap items-center gap-2">
            <RoleBadge role={performer.role} />
            <span className="text-muted-foreground font-mono text-[10px]">
              {performer.employeeId}
            </span>
          </span>
        </div>

        <div className="ml-auto flex flex-col items-end">
          <span className="text-muted-foreground text-[10px] font-medium">
            Composite score
          </span>
          <span className="stat-figure text-primary">
            {formatNumeric(performer.starScore)}
          </span>
        </div>
      </div>

      {/* Headline figures */}
      <dl className="divide-border border-border grid grid-cols-2 border-y sm:grid-cols-4 sm:divide-x">
        <Figure
          label="Scaled progress"
          value={formatNumeric(performer.scaledProgress)}
        />
        <Figure
          label="Productivity"
          value={
            performer.productivity === null
              ? '\u2014'
              : `${formatNumeric(performer.productivity)}/h`
          }
          delta={performer.productivityDiff}
        />
        <Figure
          label="Hours logged"
          value={formatNumeric(performer.hoursLogged)}
        />
        <Figure
          label="Allocation"
          value={`${formatNumeric(performer.allocationPercent)}%`}
          delta={performer.loadingDiff}
        />
      </dl>

      {/* Score composition */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5">
        <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
          Score composition
        </span>
        <Term
          label={`Prod. diff ×${STAR_WEIGHTS.productivityDiff}`}
          value={breakdown.productivityDiff}
        />
        <Term
          label={`Progress ×${STAR_WEIGHTS.scaledProgress}`}
          value={breakdown.scaledProgress}
        />
        <Term
          label={`Freshness ×${STAR_WEIGHTS.freshnessScore}`}
          value={breakdown.freshnessScore}
        />
        <Term
          label={`Rotten ×${STAR_WEIGHTS.rottenCount}`}
          value={-breakdown.rottenPenalty}
        />
        {medianProductivity !== null ? (
          <span className="text-muted-foreground ml-auto text-[11px]">
            Team median{' '}
            <span className="text-foreground font-mono font-semibold">
              {formatNumeric(medianProductivity)}
            </span>{' '}
            /h
          </span>
        ) : null}
      </div>
    </section>
  );
}

/** Two-character initials, matching the rail trigger. */
function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const initials = parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
  return initials || '?';
}

/* -------------------------------------------------------------------------- */

interface FigureProps {
  label: string;
  value: string;
  delta?: number | null;
}

function Figure({ label, value, delta }: FigureProps) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2.5">
      <dt className="text-muted-foreground text-[10px] font-medium">{label}</dt>
      <dd className="text-foreground text-base font-semibold tabular">
        {value}
      </dd>
      {delta !== undefined && delta !== null ? (
        <dd
          className={cn(
            'text-[11px] font-medium tabular',
            delta >= 0 ? 'text-emerald-700' : 'text-rose-700',
          )}
        >
          {delta >= 0 ? '+' : ''}
          {formatNumeric(delta)} vs median
        </dd>
      ) : null}
    </div>
  );
}

function Term({ label, value }: { label: string; value: number }) {
  return (
    <span className="text-muted-foreground text-[11px]">
      {label}{' '}
      <span
        className={cn(
          'font-mono font-semibold tabular',
          value >= 0 ? 'text-foreground' : 'text-rose-700',
        )}
      >
        {value >= 0 ? '+' : ''}
        {formatNumeric(value)}
      </span>
    </span>
  );
}
