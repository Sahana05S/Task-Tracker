'use client';

import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  CHART_AXIS,
  CHART_GRID,
  CHART_POSITIVE,
  seriesColor,
} from '@/components/dashboard/chart-palette';
import type {
  EmployeeAnalyticsCharts,
  EmployeeDistributionBucket,
  EmployeeTrendPoint,
} from '@/lib/team/employee-charts';
import { formatNumeric } from '@/lib/tracker/format';

export function EmployeeAnalyticsChartsPanel({
  charts,
}: {
  charts: EmployeeAnalyticsCharts;
}) {
  return (
    <section className="grid gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="panel-title text-lg">Individual analytics charts</h2>
        <p className="text-muted-foreground text-sm">
          Dated month-to-date observations and as-of task mix, calculated from recorded
          task, log, star, and documentation data.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <TrendChart
          title="Performance score trend"
          subtitle="Dated M07 month-to-date scores; missing inputs leave gaps"
          data={charts.performanceScoreTrend}
          empty="No performance score data is available yet."
        />
        <TrendChart
          title="Productivity trend"
          subtitle="Month-to-date earned credit / regular attendance hours"
          data={charts.productivityTrend}
          empty="Dated productivity evidence is unavailable."
        />
        <TrendChart
          title="Progress trend"
          subtitle="Period-earned captured scaled credit, including checklist/manual work"
          data={charts.progressTrend}
          empty="Dated progress evidence is unavailable."
        />
        <TrendChart
          title="Completion trend"
          subtitle="Month-to-date completion credit at captured shares"
          data={charts.completionTrend}
          empty="Dated completion evidence is unavailable."
        />
        <TrendChart
          title="Loading trend"
          subtitle="Normalized loading fraction from dated carried-task evidence"
          data={charts.loadingTrend}
          empty="No task loading exists for this employee yet."
        />
        <TrendChart
          title="Criticality trend"
          subtitle="Normalized priority credit from dated evidence"
          data={charts.criticalityTrend}
          empty="No priority-bearing tasks are available yet."
        />
        <DistributionChart
          title="Task types"
          subtitle="Assigned task categories"
          data={charts.taskTypes}
          empty="No task types to chart yet."
        />
        <DistributionChart
          title="Task priorities"
          subtitle="Assigned task priority split"
          data={charts.taskPriorities}
          empty="No priorities to chart yet."
        />
        <DistributionChart
          title="Task statuses"
          subtitle="Assigned task status split"
          data={charts.taskStatuses}
          empty="No statuses to chart yet."
        />
        <DistributionChart
          title="Task documentation"
          subtitle="Task links plus undocumented tasks"
          data={charts.taskDocumentation}
          empty="No task documentation exists yet."
        />
        <DistributionChart
          title="Task freshness"
          subtitle="Fresh, stale, and rotten task mix"
          data={charts.taskFreshness}
          empty="No task freshness to chart yet."
        />
      </div>
    </section>
  );
}

function TrendChart({
  title,
  subtitle,
  data,
  empty,
}: {
  title: string;
  subtitle: string;
  data: readonly EmployeeTrendPoint[];
  empty: string;
}) {
  return (
    <ChartShell title={title} subtitle={subtitle}>
      {data.length === 0 || data.every(p=>p.value===null) ? (
        <EmptyChart>{empty}</EmptyChart>
      ) : (
        <div className="soft-inset h-64 w-full p-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
            >
              <CartesianGrid stroke={CHART_GRID} vertical={false} />
              <XAxis
                dataKey="label"
                stroke={CHART_AXIS}
                tickLine={false}
                axisLine={{ stroke: CHART_GRID }}
                fontSize={11}
                minTickGap={16}
              />
              <YAxis
                stroke={CHART_AXIS}
                tickLine={false}
                axisLine={false}
                fontSize={11}
                width={42}
              />
              <Tooltip content={<TrendTooltip />} />
              <Line
                connectNulls={false}
                type="monotone"
                dataKey="value"
                stroke={CHART_POSITIVE}
                strokeWidth={2.5}
                dot={{ r: 2.5, fill: CHART_POSITIVE }}
                activeDot={{ r: 4 }}
                name={title}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <details className="mt-2"><summary>Read chart values</summary><table className="w-full text-sm"><thead><tr><th>Date</th><th>Value</th></tr></thead><tbody>{data.map(p=><tr key={p.date}><td>{p.date}</td><td>{p.display??(p.value===null?'Unavailable':p.value.toFixed(6))}</td></tr>)}</tbody></table></details>
    </ChartShell>
  );
}

function DistributionChart({
  title,
  subtitle,
  data,
  empty,
}: {
  title: string;
  subtitle: string;
  data: readonly EmployeeDistributionBucket[];
  empty: string;
}) {
  const visible = React.useMemo(
    () => data.filter((bucket) => bucket.value > 0),
    [data],
  );
  const total = visible.reduce((sum, bucket) => sum + bucket.value, 0);

  return (
    <ChartShell title={title} subtitle={subtitle}>
      {visible.length === 0 ? (
        <EmptyChart>{empty}</EmptyChart>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
          <div className="soft-inset h-56 w-full p-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<DistributionTooltip total={total} />} />
                <Pie
                  data={visible}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="55%"
                  outerRadius="84%"
                  paddingAngle={2}
                  stroke="var(--color-white)"
                  strokeWidth={1}
                >
                  {visible.map((bucket, index) => (
                    <Cell key={bucket.key} fill={seriesColor(index)} />
                  ))}
                </Pie>
                <Legend
                  verticalAlign="bottom"
                  height={28}
                  formatter={(value) => (
                    <span className="text-muted-foreground text-[11px]">
                      {value}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="soft-inset h-56 w-full p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={visible}
                layout="vertical"
                margin={{ top: 4, right: 8, bottom: 4, left: 6 }}
              >
                <CartesianGrid stroke={CHART_GRID} horizontal={false} />
                <XAxis
                  type="number"
                  stroke={CHART_AXIS}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  stroke={CHART_AXIS}
                  tickLine={false}
                  axisLine={{ stroke: CHART_GRID }}
                  fontSize={11}
                  width={88}
                />
                <Tooltip content={<DistributionTooltip total={total} />} />
                <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                  {visible.map((bucket, index) => (
                    <Cell key={bucket.key} fill={seriesColor(index)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </ChartShell>
  );
}

function ChartShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="soft-card flex flex-col gap-4 p-5">
      <header className="flex flex-col gap-0.5">
        <h3 className="panel-title text-base">{title}</h3>
        <p className="text-muted-foreground text-xs">{subtitle}</p>
      </header>
      {children}
    </section>
  );
}

function EmptyChart({ children }: { children: React.ReactNode }) {
  return (
    <p className="soft-inset text-muted-foreground flex h-64 items-center justify-center px-6 text-center text-sm">
      {children}
    </p>
  );
}

interface TooltipPayloadEntry<Payload> {
  payload?: Payload;
}

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly TooltipPayloadEntry<EmployeeTrendPoint>[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <TooltipShell title={point.label}>
      <TooltipRow label="Value" value={point.display??(point.value===null?'Unavailable':point.value.toFixed(6))} />
    </TooltipShell>
  );
}

function DistributionTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: readonly TooltipPayloadEntry<EmployeeDistributionBucket>[];
  total: number;
}) {
  const bucket = payload?.[0]?.payload;
  if (!active || !bucket) return null;

  return (
    <TooltipShell title={bucket.label}>
      <TooltipRow label="Count" value={formatNumeric(bucket.value, 0)} />
      <TooltipRow
        label="Share"
        value={`${formatNumeric(total === 0 ? 0 : (bucket.value / total) * 100, 0)}%`}
      />
    </TooltipShell>
  );
}

function TooltipShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border rounded-xl border bg-white px-3.5 py-2.5 text-xs shadow-soft-lg">
      <p className="text-foreground font-semibold">{title}</p>
      <dl className="text-muted-foreground mt-1.5 flex flex-col gap-0.5">
        {children}
      </dl>
    </div>
  );
}

function TooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt>{label}</dt>
      <dd className="text-foreground font-semibold tabular">{value}</dd>
    </div>
  );
}
