import { displayPerformance } from '@/lib/performance/exact';
import * as React from 'react';

import type { TeamAnalytics } from '@/lib/analytics/engine';
import { formatNumeric } from '@/lib/tracker/format';
import { cn } from '@/lib/utils';

export interface TeamStatsGridProps {
  analytics: TeamAnalytics;
  attendanceComplete?: boolean;
}

interface StatCardProps {
  label: string;
  value: string;
  unit?: string;
  detail: string;
  /**
   * Renders the card as the forest hero. Reserved for the single most important
   * figure on the page; a second one would cancel the emphasis.
   */
  hero?: boolean;
}

/**
 * Key metric row.
 *
 * Label, figure, supporting line. No icons and no corner affordances — a metric
 * card is four words and a number, and anything else on it is decoration competing
 * with the number.
 *
 * The leading card is the hero in forest; the rest are bordered white, so the
 * hierarchy is carried by surface rather than by size.
 *
 * Every card pairs its figure with the denominator behind it: a rate is never shown
 * without the quantity it came from.
 */
export function TeamStatsGrid({ analytics, attendanceComplete = true }: TeamStatsGridProps) {
  const { totals, medians } = analytics;

  return (
    <dl className="grid grid-cols-2 gap-3 xl:grid-cols-5">
      <StatCard
        hero
        label="Median employee productivity"
        value={
          medians.productivity === null
            ? '\u2014'
            : displayPerformance(medians.productivity)
        }
        unit={medians.productivity === null ? undefined : '/h'}
        detail={
          medians.productivity === null
            ? 'Productivity inputs unavailable'
            : 'Period-earned scaled credit / regular attendance hours'
        }
      />

      <StatCard
        label="Period-earned scaled credit"
        value={displayPerformance(totals.scaledProgress)}
        detail={`${totals.eligibleTaskCount} metric-eligible ${
          totals.eligibleTaskCount === 1 ? 'task' : 'tasks'
        }`}
      />

      <StatCard
        label="Visible detail log hours"
        value={formatNumeric(totals.hoursLogged)}
        unit="h"
        detail={
          // Called out only when they diverge, which happens when hours are logged
          // against off-hours or zero-scale tasks. Those hours are real but cannot
          // contribute to a productivity rate.
          totals.eligibleHours !== totals.hoursLogged
            ? `${formatNumeric(totals.eligibleHours)} h against eligible tasks; employee productivity uses attendance`
            : `${totals.contributingMemberCount} of ${totals.activeMemberCount} contributed`
        }
      />

      <StatCard
        label="Known regular attendance hours"
        value={attendanceComplete ? formatNumeric(totals.attendanceHours) : 'Unavailable'}
        unit={attendanceComplete ? 'h' : undefined}
        detail={attendanceComplete ? `${formatNumeric(totals.payableDays)} payable days · ${formatNumeric(totals.offHours)} off-hours` : 'One or more daily attendance inputs are missing; see report validity.'}
      />

      <StatCard
        label="Allocation spread"
        value={formatNumeric(totals.allocationSpread)}
        unit="%"
        detail={
          medians.allocationPercent === null
            ? 'No workload assigned'
            : `Median ${formatNumeric(medians.allocationPercent)}%`
        }
      />
    </dl>
  );
}

function StatCard({ label, value, unit, detail, hero = false }: StatCardProps) {
  return (
    <div className={hero ? 'metric-card-primary' : 'metric-card'}>
      <dt
        className={cn(
          'text-[11px] font-medium',
          hero ? 'text-white/80' : 'text-muted-foreground',
        )}
      >
        {label}
      </dt>

      <dd className="flex items-baseline gap-1">
        <span className="stat-figure">{value}</span>
        {unit ? (
          <span
            className={cn(
              'font-mono text-xs',
              hero ? 'text-white/60' : 'text-muted-foreground',
            )}
          >
            {unit}
          </span>
        ) : null}
      </dd>

      <dd className="metric-trend">{detail}</dd>
    </div>
  );
}
