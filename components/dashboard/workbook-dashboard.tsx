import type { ReactNode } from 'react';

import { seriesColor } from '@/components/dashboard/chart-palette';
import type {
  DashboardBucket,
  DashboardMemberMetric,
  DateBucket,
  DeadlineOutcomeBucket,
  WorkbookDashboardCharts,
} from '@/lib/analytics/dashboard-charts';
import { formatNumeric } from '@/shared/tracker/format';
import { cn } from '@/shared/utils';

export function WorkbookDashboard({
  charts,
}: {
  charts: WorkbookDashboardCharts;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="panel-title text-lg">Mission overview</h2>
        <p className="text-muted-foreground text-sm">
          Mission progress, allocation, status, deadlines, mission mix and team
          loading.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SignedBarCard
          title="Performance preview with median"
          subtitle="Shared ten-factor score; incomplete results are unavailable"
          items={charts.performanceWithMedian.members}
          median={charts.performanceWithMedian.median}
          empty={charts.performanceUnavailableReason ?? "No member performance has been calculated for this period."}
        />
        <BarListCard
          title="Total progress"
          subtitle="Period-earned captured scaled progress from tracked tasks"
          items={charts.totalProgressByTeam}
          empty="No task progress is available yet."
        />
        <DistributionCard
          title="Mission priorities"
          subtitle="Count of tracked missions by priority"
          items={charts.taskPriorities}
          empty="No priorities to chart yet."
        />
        <DistributionCard
          title="Mission statuses"
          subtitle="Count of tracked missions by current status"
          items={charts.taskStatuses}
          empty="No task statuses to chart yet."
        />
        <DistributionCard
          title="Mission assignees"
          subtitle="Assignment count, including multi-assignee missions"
          items={charts.taskAssignees}
          empty="No tasks are assigned yet."
        />
        <DistributionCard
          title="Mission types"
          subtitle="Mission category split from the tracker"
          items={charts.taskTypes}
          empty="No task types to chart yet."
        />
        <BarListCard
          title="Priority loading on team"
          subtitle="Sum of priority weights carried by each assignee"
          items={charts.priorityLoadingOnTeam}
          empty={charts.priorityLoadingUnavailableReason ?? "No priority loading has been assigned yet."}
        />
        <TimelineCard
          title="Missions done by date"
          subtitle="Completed mission count by completion date"
          items={charts.tasksDoneByDate}
          empty="No tasks were completed in this period."
        />
        <DistributionCard
          title="Met / missed deadlines"
          subtitle="Completed deadlines plus open overdue work"
          items={charts.deadlineOutcomes}
          empty="No deadline outcomes are available yet."
        />
        <SummaryCard charts={charts} />
      </div>
    </section>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="soft-card flex min-h-72 flex-col gap-4 p-5 sm:p-6">
      <header className="flex flex-col gap-0.5">
        <h3 className="text-foreground text-base font-bold tracking-tight">{title}</h3>
        <p className="text-muted-foreground text-xs">{subtitle}</p>
      </header>
      {children}
    </section>
  );
}

function EmptyChart({ children }: { children: ReactNode }) {
  return (
    <p className="soft-inset text-muted-foreground flex min-h-48 flex-1 items-center justify-center px-6 text-center text-sm">
      {children}
    </p>
  );
}

function SignedBarCard({
  title,
  subtitle,
  items,
  median,
  empty,
}: {
  title: string;
  subtitle: string;
  items: readonly DashboardMemberMetric[];
  median: number | null;
  empty: string;
}) {
  const sorted = [...items].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  const maxMagnitude = Math.max(
    ...sorted.map((item) => Math.abs(item.value)),
    Math.abs(median ?? 0),
    0,
  );

  return (
    <ChartCard title={title} subtitle={subtitle}>
      {sorted.length === 0 ? (
        <EmptyChart>{empty}</EmptyChart>
      ) : (
        <div className="flex flex-1 flex-col gap-3">
          <div className="soft-inset flex flex-col gap-3 p-3">
            {sorted.map((item) => {
              const width =
                maxMagnitude === 0
                  ? 0
                  : Math.min(50, (Math.abs(item.value) / maxMagnitude) * 50);
              return (
                <div key={item.userId} className="grid gap-1">
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-foreground truncate font-medium">
                      {item.label}
                    </span>
                    <span className="tabular text-muted-foreground">
                      {formatSigned(item.value)}
                    </span>
                  </div>
                  <div className="relative h-3 overflow-hidden rounded-full bg-[#ebe7f6]">
                    <span className="absolute inset-y-0 left-1/2 w-px bg-slate-300" />
                    <span
                      className={cn(
                        'absolute inset-y-0 rounded-full',
                        item.value >= 0
                          ? 'left-1/2 bg-success'
                          : 'right-1/2 bg-rose-500',
                      )}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-muted-foreground text-xs">
            Median score:{' '}
            <span className="text-foreground font-semibold tabular">
              {median === null ? '\u2014' : formatSigned(median)}
            </span>
          </p>
        </div>
      )}
    </ChartCard>
  );
}

function BarListCard({
  title,
  subtitle,
  items,
  empty,
}: {
  title: string;
  subtitle: string;
  items: readonly DashboardMemberMetric[];
  empty: string;
}) {
  const sorted = [...items].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  const visible = sorted.filter((item) => item.value > 0);
  const max = Math.max(...visible.map((item) => item.value), 0);

  return (
    <ChartCard title={title} subtitle={subtitle}>
      {visible.length === 0 ? (
        <EmptyChart>{empty}</EmptyChart>
      ) : (
        <div className="soft-inset flex flex-1 flex-col gap-3 p-3">
          {visible.map((item, index) => (
            <MetricBar
              key={item.userId}
              label={item.label}
              value={item.value}
              max={max}
              color={seriesColor(index)}
              detail={
                item.taskCount === undefined
                  ? undefined
                  : `${item.taskCount} ${item.taskCount === 1 ? 'mission' : 'missions'}`
              }
            />
          ))}
        </div>
      )}
    </ChartCard>
  );
}

function TimelineCard({
  title,
  subtitle,
  items,
  empty,
}: {
  title: string;
  subtitle: string;
  items: readonly DateBucket[];
  empty: string;
}) {
  const max = Math.max(...items.map((item) => item.value), 0);

  return (
    <ChartCard title={title} subtitle={subtitle}>
      {items.length === 0 ? (
        <EmptyChart>{empty}</EmptyChart>
      ) : (
        <div className="soft-inset flex flex-1 flex-col gap-3 p-3">
          {items.map((item, index) => (
            <MetricBar
              key={item.date}
              label={item.label}
              value={item.value}
              max={max}
              color={seriesColor(index)}
            />
          ))}
        </div>
      )}
    </ChartCard>
  );
}

function DistributionCard({
  title,
  subtitle,
  items,
  empty,
}: {
  title: string;
  subtitle: string;
  items: readonly (DashboardBucket | DashboardMemberMetric | DeadlineOutcomeBucket)[];
  empty: string;
}) {
  const visible = items.filter((item) => item.value > 0);
  const total = visible.reduce((sum, item) => sum + item.value, 0);

  return (
    <ChartCard title={title} subtitle={subtitle}>
      {visible.length === 0 || total === 0 ? (
        <EmptyChart>{empty}</EmptyChart>
      ) : (
        <div className="grid flex-1 gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <div className="soft-inset flex items-center justify-center p-4">
            <div
              className="relative size-32 rounded-full"
              style={{ background: conicGradient(visible, total) }}
              aria-hidden="true"
            >
              <div className="absolute inset-8 rounded-full bg-white" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-foreground text-sm font-semibold tabular">
                  {formatNumeric(total, 0)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-center gap-2">
            {visible.map((item, index) => (
              <div key={legendKey(item)} className="flex items-center gap-2 text-xs">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: seriesColor(index) }}
                />
                <span className="text-foreground min-w-0 flex-1 truncate font-medium">
                  {item.label}
                </span>
                <span className="text-muted-foreground tabular">
                  {formatNumeric(item.value, 0)}
                </span>
                <span className="text-muted-foreground w-10 text-right tabular">
                  {formatNumeric((item.value / total) * 100, 0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

function SummaryCard({ charts }: { charts: WorkbookDashboardCharts }) {
  return (
    <ChartCard
      title="Dashboard coverage"
      subtitle="The live mission set behind these workbook charts"
    >
      <dl className="grid flex-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
        <SummaryMetric
          label="Tracked missions"
          value={charts.summary.trackedTaskCount}
          detail="Carried in this month"
        />
        <SummaryMetric
          label="Completed missions"
          value={charts.summary.completedTaskCount}
          detail="Done inside the period"
        />
        <SummaryMetric
          label="Open overdue"
          value={charts.summary.overdueOpenTaskCount}
          detail="Active missions past due"
        />
      </dl>
    </ChartCard>
  );
}

function MetricBar({
  label,
  value,
  max,
  color,
  detail,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  detail?: string;
}) {
  const width = max === 0 ? 0 : Math.max(3, (value / max) * 100);

  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-foreground truncate font-medium">{label}</span>
        <span className="flex items-baseline gap-2">
          {detail ? (
            <span className="text-muted-foreground text-[11px]">{detail}</span>
          ) : null}
          <span className="text-muted-foreground tabular">
            {formatNumeric(value, value % 1 === 0 ? 0 : 2)}
          </span>
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[#ebe7f6]">
        <span
          className="block h-full rounded-full"
          style={{ width: `${width}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="metric-card">
      <dt className="text-muted-foreground text-[11px] font-medium">{label}</dt>
      <dd className="stat-figure">{formatNumeric(value, 0)}</dd>
      <dd className="metric-trend">{detail}</dd>
    </div>
  );
}

function conicGradient(
  items: readonly (DashboardBucket | DashboardMemberMetric | DeadlineOutcomeBucket)[],
  total: number,
): string {
  let cursor = 0;
  const stops = items.map((item, index) => {
    const start = cursor;
    const end = cursor + (item.value / total) * 100;
    cursor = end;
    return `${seriesColor(index)} ${start}% ${end}%`;
  });

  return `conic-gradient(${stops.join(', ')})`;
}

function legendKey(
  item: DashboardBucket | DashboardMemberMetric | DeadlineOutcomeBucket,
): string {
  if ('userId' in item) return item.userId;
  return item.key;
}

function formatSigned(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatNumeric(value)}`;
}
