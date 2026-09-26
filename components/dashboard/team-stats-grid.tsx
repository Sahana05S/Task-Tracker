import * as React from 'react';
import {
  ActivityIcon,
  ArrowUpRightIcon,
  ClockIcon,
  GaugeIcon,
  ScaleIcon,
  type LucideIcon,
} from 'lucide-react';

import type { TeamAnalytics } from '@/lib/analytics/engine';
import { formatNumeric } from '@/lib/tracker/format';
import { cn } from '@/lib/utils';

export interface TeamStatsGridProps {
  analytics: TeamAnalytics;
}

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  detail: string;
  /**
   * Renders the card as the forest-green hero. Reserved for the single most
   * important figure on the page; a second one would cancel the emphasis.
   */
  hero?: boolean;
}

/**
 * Key metric row.
 *
 * The leading card is the hero: a full forest container with high-contrast text,
 * which is what draws the eye first. The remaining three are white soft cards, so
 * the hierarchy is carried by surface rather than by size.
 *
 * Every card pairs its headline figure with the denominator behind it — a rate is
 * never shown without the quantity it came from.
 */
export function TeamStatsGrid({ analytics }: TeamStatsGridProps) {
  const { totals, medians } = analytics;

  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        hero
        icon={GaugeIcon}
        label="Team average productivity"
        value={
          totals.averageProductivity === null
            ? '\u2014'
            : formatNumeric(totals.averageProductivity)
        }
        unit={totals.averageProductivity === null ? undefined : 'per hour'}
        detail={
          medians.productivity === null
            ? 'No hours logged this period'
            : `Median ${formatNumeric(medians.productivity)} per hour`
        }
      />

      <StatCard
        icon={ActivityIcon}
        label="Total scaled progress"
        value={formatNumeric(totals.scaledProgress)}
        detail={`Across ${totals.eligibleTaskCount} metric-eligible ${
          totals.eligibleTaskCount === 1 ? 'task' : 'tasks'
        }`}
      />

      <StatCard
        icon={ClockIcon}
        label="Total hours logged"
        value={formatNumeric(totals.hoursLogged)}
        unit="hours"
        detail={
          // Called out only when they diverge, which happens when hours are
          // logged against off-hours or zero-scale tasks. Those hours are real
          // but cannot contribute to a productivity rate.
          totals.eligibleHours !== totals.hoursLogged
            ? `${formatNumeric(totals.eligibleHours)} on metric-eligible tasks`
            : `${totals.contributingMemberCount} of ${totals.activeMemberCount} active ${
                totals.activeMemberCount === 1 ? 'member' : 'members'
              } contributed`
        }
      />

      <StatCard
        icon={ScaleIcon}
        label="Task allocation spread"
        value={`${formatNumeric(totals.allocationSpread)}%`}
        detail={
          medians.allocationPercent === null
            ? 'No workload assigned'
            : `Median share ${formatNumeric(medians.allocationPercent)}%`
        }
      />
    </dl>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  detail,
  hero = false,
}: StatCardProps) {
  return (
    <div className={hero ? 'metric-card-primary' : 'metric-card'}>
      {/* Diagonal arrow affordance, top right. Decorative: the card is not a
          link, so it is hidden from assistive technology. */}
      <span className="metric-arrow" aria-hidden="true">
        <ArrowUpRightIcon className="size-3.5" />
      </span>

      <dt
        className={cn(
          'flex items-center gap-2 pr-10 text-xs font-medium',
          hero ? 'text-white/85' : 'text-muted-foreground',
        )}
      >
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        {label}
      </dt>

      <dd className="flex items-baseline gap-1.5">
        <span className="stat-figure">{value}</span>
        {unit ? (
          <span
            className={cn(
              'text-xs',
              hero ? 'text-white/70' : 'text-muted-foreground',
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
