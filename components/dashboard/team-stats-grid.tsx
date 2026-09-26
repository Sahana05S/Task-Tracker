import * as React from 'react';
import {
  ActivityIcon,
  ClockIcon,
  GaugeIcon,
  ScaleIcon,
  type LucideIcon,
} from 'lucide-react';

import type { TeamAnalytics } from '@/lib/analytics/engine';
import { formatNumeric } from '@/lib/tracker/format';

export interface TeamStatsGridProps {
  analytics: TeamAnalytics;
}

/**
 * Dense key-metric row.
 *
 * Each card pairs the headline figure with the denominator it came from, so a
 * rate is never shown without the quantity behind it.
 */
export function TeamStatsGrid({ analytics }: TeamStatsGridProps) {
  const { totals, medians } = analytics;

  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
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

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  detail: string;
}

function StatCard({ icon: Icon, label, value, unit, detail }: StatCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <dt className="flex items-center gap-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        {label}
      </dt>
      <dd className="flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold text-slate-900 [font-variant-numeric:tabular-nums]">
          {value}
        </span>
        {unit ? (
          <span className="text-xs text-slate-500">{unit}</span>
        ) : null}
      </dd>
      <dd className="text-xs text-slate-500">{detail}</dd>
    </div>
  );
}
