'use client';

import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  CHART_AXIS,
  CHART_GRID,
  CHART_REFERENCE,
  SERIES_COLORS,
} from '@/shared/ui/chart-palette';
import type {
  EmployeeAnalyticsCharts,
  EmployeeDayHours,
  EmployeeDistributionBucket,
  EmployeeTrendPoint,
} from '@/modules/team/internal/employee-charts';
import type { DateBucket, DeadlineOutcomeBucket, Factor } from '@/modules/scoring/client';
import { FACTORS } from '@/modules/scoring/client';
import { formatHours } from '@/shared/tracker/format';
import { EmptyState, StatTile } from '@/shared/ui/mission-ui';

/** The member's series: the first categorical slot. Context series use the de-emphasis gray. */
const MEMBER = SERIES_COLORS[0];
const CONTEXT = SERIES_COLORS[7];
const TICK = { fontSize: 11, fill: CHART_AXIS };

const FACTOR_TITLES: Record<Factor, string> = {
  productivity: 'Productivity',
  criticality: 'Criticality',
  loading: 'Loading',
  completion: 'Completion',
  progress: 'Progress',
  sales: 'Sales',
  facts: 'Daily facts',
  ideas: 'Ideas',
  suggestions: 'Suggestions',
  freshness: 'Freshness',
};

/** Charts tab: factor small multiples, hours, missions and the mission mix. */
export function EmployeeChartsPanel({ charts }: { charts: EmployeeAnalyticsCharts }) {
  return (
    <div className="grid gap-5 lg:gap-6">
      <ChartSection
        title="Each factor against the team median"
        subtitle="Month-to-date raw value per dated observation. The dashed line is the team median; gaps are days the value was unavailable."
      >
        <MedianLegend />
        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-5">
          {FACTORS.map((factor) => (
            <FactorMultiple key={factor} title={FACTOR_TITLES[factor]} data={charts.factorTrends[factor]} />
          ))}
        </div>
        <ValueTable
          caption="Factor values and medians"
          head={['Date', ...FACTORS.map((f) => FACTOR_TITLES[f])]}
          rows={(charts.factorTrends.productivity ?? []).map((point, index) => [
            point.date,
            ...FACTORS.map((f) => {
              const p = charts.factorTrends[f][index];
              return p ? `${p.display ?? 'Unavailable'} / ${p.medianDisplay ?? 'Unavailable'}` : 'Unavailable';
            }),
          ])}
          note="Each cell is the member's value / the team median."
        />
      </ChartSection>

      <div className="grid gap-5 lg:gap-6 xl:grid-cols-2">
        <HoursChart data={charts.dailyHours} />
        <MissionsChart done={charts.missionsDone} deadlines={charts.deadlines} />
      </div>

      <ChartSection title="Mission mix" subtitle="Counts across this member's missions as of the selected day.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Distribution title="Types" data={charts.taskTypes} />
          <Distribution title="Priorities" data={charts.taskPriorities} />
          <Distribution title="Statuses" data={charts.taskStatuses} />
          <Distribution title="Documentation" data={charts.taskDocumentation} />
          <Distribution title="Freshness" data={charts.taskFreshness} />
        </div>
      </ChartSection>
    </div>
  );
}

/** Overview: the composite score against the team median. */
export function ScoreVsMedianChart({ data }: { data: readonly EmployeeTrendPoint[] }) {
  const empty = data.every((p) => p.value === null && (p.median ?? null) === null);
  return (
    <ChartSection
      title="Score against the team median"
      subtitle="Composite score per dated observation. Missing inputs leave gaps rather than zeros."
    >
      {empty ? (
        <EmptyState variant="chart">No dated score is available yet this month. Scores appear once every factor has its inputs.</EmptyState>
      ) : (
        <>
          <MedianLegend />
          <div className="h-64 w-full">
            <TrendLines data={data} name="Score" />
          </div>
        </>
      )}
      <ValueTable caption="Score values" head={['Date', 'Score', 'Team median']} rows={data.map((p) => [p.date, p.display ?? 'Unavailable', p.medianDisplay ?? 'Unavailable'])} />
    </ChartSection>
  );
}

function FactorMultiple({ title, data }: { title: string; data: readonly EmployeeTrendPoint[] }) {
  const latest = [...data].reverse().find((p) => p.value !== null);
  const empty = data.every((p) => p.value === null && (p.median ?? null) === null);
  return (
    <figure className="bg-muted/50 grid min-w-0 gap-1 rounded-xl p-2.5 sm:p-3">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-foreground text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground text-xs">{latest ? latest.display : 'Unavailable'}</span>
      </figcaption>
      {empty ? (
        <p className="text-muted-foreground flex h-28 items-center justify-center text-center text-xs">No dated values</p>
      ) : (
        <div className="h-28 w-full">
          <TrendLines data={data} name={title} compact />
        </div>
      )}
    </figure>
  );
}

function TrendLines({ data, name, compact = false }: { data: readonly EmployeeTrendPoint[]; name: string; compact?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data as EmployeeTrendPoint[]} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={CHART_GRID} vertical={false} />
        <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: CHART_GRID }} minTickGap={compact ? 28 : 16} hide={compact} />
        <YAxis tick={TICK} tickLine={false} axisLine={false} width={compact ? 34 : 42} tickCount={compact ? 3 : 5} />
        <Tooltip content={<TrendTooltip name={name} />} cursor={{ stroke: CHART_GRID, strokeWidth: 1 }} />
        <Line type="linear" dataKey="median" stroke={CHART_REFERENCE} strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} name="Team median" />
        <Line type="linear" dataKey="value" stroke={MEMBER} strokeWidth={2} dot={data.length <= 12 ? { r: compact ? 2.5 : 4, fill: MEMBER, stroke: 'var(--color-white)', strokeWidth: 2 } : false} activeDot={{ r: 4, stroke: 'var(--color-white)', strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} name={name} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function HoursChart({ data }: { data: readonly EmployeeDayHours[] }) {
  const logged = data.some((d) => d.taskHours > 0 || d.attendanceHours !== null);
  const missing = data.filter((d) => d.attendanceHours === null).length;
  return (
    <ChartSection title="Hours per day" subtitle="Task hours logged beside regular attendance hours.">
      {logged ? (
        <>
          <Legend items={[{ label: 'Task hours', color: MEMBER }, { label: 'Attendance hours', color: CONTEXT }]} />
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data as EmployeeDayHours[]} margin={{ top: 6, right: 6, bottom: 0, left: 0 }} barGap={2} barCategoryGap="20%">
                <CartesianGrid stroke={CHART_GRID} vertical={false} />
                <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: CHART_GRID }} minTickGap={16} />
                <YAxis tick={TICK} tickLine={false} axisLine={false} width={34} />
                <Tooltip content={<HoursTooltip />} cursor={{ fill: 'var(--color-muted)' }} />
                <Bar dataKey="taskHours" name="Task hours" fill={MEMBER} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
                <Bar dataKey="attendanceHours" name="Attendance hours" fill={CONTEXT} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {missing ? <p className="text-muted-foreground text-xs">Attendance is not recorded for {missing} of {data.length} days; those days show task hours only.</p> : null}
        </>
      ) : (
        <EmptyState variant="chart">No hours logged and no attendance recorded this month yet.</EmptyState>
      )}
      <ValueTable caption="Hours per day" head={['Date', 'Task hours', 'Attendance hours']} rows={data.map((d) => [d.date, formatHours(d.taskHours), d.attendanceHours === null ? 'Not recorded' : formatHours(d.attendanceHours)])} />
    </ChartSection>
  );
}

function MissionsChart({ done, deadlines }: { done: readonly DateBucket[]; deadlines: readonly DeadlineOutcomeBucket[] }) {
  const count = (key: DeadlineOutcomeBucket['key']) => deadlines.find((d) => d.key === key)?.value ?? 0;
  return (
    <ChartSection title="Missions and deadlines" subtitle="Missions completed by date, and deadline outcomes this month.">
      <dl className="grid grid-cols-3 gap-2.5">
        <StatTile label="Met deadline" value={String(count('met'))} tone={count('met') ? 'success' : 'default'} />
        <StatTile label="Missed deadline" value={String(count('missed'))} tone={count('missed') ? 'alert' : 'default'} />
        <StatTile label="Open overdue" value={String(count('open'))} tone={count('open') ? 'alert' : 'default'} />
      </dl>
      {done.some((d) => d.value > 0) ? (
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={done as DateBucket[]} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={CHART_GRID} vertical={false} />
              <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: CHART_GRID }} minTickGap={16} />
              <YAxis tick={TICK} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
              <Tooltip content={<CountTooltip unit="completed" />} cursor={{ fill: 'var(--color-muted)' }} />
              <Bar dataKey="value" name="Completed" fill={MEMBER} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState>No missions completed this month yet.</EmptyState>
      )}
      <ValueTable caption="Missions completed by date" head={['Date', 'Completed']} rows={done.filter((d) => d.value > 0).map((d) => [d.date, String(d.value)])} />
    </ChartSection>
  );
}

function Distribution({ title, data }: { title: string; data: readonly EmployeeDistributionBucket[] }) {
  const visible = data.filter((b) => b.value > 0);
  return (
    <figure className="bg-muted/50 grid content-start gap-2 rounded-xl p-3">
      <figcaption className="text-foreground text-sm font-semibold">{title}</figcaption>
      {visible.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-xs">Nothing to count yet</p>
      ) : (
        <div style={{ height: visible.length * 26 + 8 }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={visible} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 0 }}>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="label" tick={TICK} tickLine={false} axisLine={false} width={110} />
              <Tooltip content={<CountTooltip unit="missions" />} cursor={{ fill: 'var(--color-muted)' }} />
              <Bar dataKey="value" fill={MEMBER} radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive={false} label={{ position: 'right', fontSize: 11, fill: 'var(--color-foreground)' }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}

function ChartSection({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="soft-card grid min-w-0 gap-4 p-5 sm:p-6">
      <header className="grid gap-0.5">
        <h2 className="text-foreground text-base font-bold tracking-tight">{title}</h2>
        <p className="text-muted-foreground text-xs">{subtitle}</p>
      </header>
      {children}
    </section>
  );
}

function MedianLegend() {
  return <Legend items={[{ label: 'This member', color: MEMBER }, { label: 'Team median', color: CHART_REFERENCE, dashed: true }]} />;
}

function Legend({ items }: { items: readonly { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legend">
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <svg aria-hidden="true" width="18" height="8" className="shrink-0">
            {item.dashed ? (
              <line x1="0" y1="4" x2="18" y2="4" stroke={item.color} strokeWidth="1.5" strokeDasharray="4 3" />
            ) : (
              <rect x="0" y="1" width="18" height="6" rx="3" fill={item.color} />
            )}
          </svg>
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function ValueTable({ caption, head, rows, note }: { caption: string; head: readonly string[]; rows: readonly (readonly string[])[]; note?: string }) {
  if (rows.length === 0) return null;
  return (
    <details className="disclosure">
      <summary>Read chart values</summary>
      {note ? <p className="text-muted-foreground mt-2 text-xs">{note}</p> : null}
      <div className="border-border mt-2 overflow-x-auto rounded-xl border">
        <table className="sheet-grid w-full">
          <caption className="sr-only">{caption}</caption>
          <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((row) => <tr key={row[0]}>{row.map((cell, i) => <td key={i} className="text-xs tabular-nums whitespace-nowrap">{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

interface TooltipProps<Payload> {
  active?: boolean;
  payload?: readonly { payload?: Payload }[];
}

function TrendTooltip({ active, payload, name }: TooltipProps<EmployeeTrendPoint> & { name: string }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <TooltipShell title={point.label}>
      <TooltipRow label={name} value={point.display ?? 'Unavailable'} />
      <TooltipRow label="Team median" value={point.medianDisplay ?? 'Unavailable'} />
    </TooltipShell>
  );
}

function HoursTooltip({ active, payload }: TooltipProps<EmployeeDayHours>) {
  const day = payload?.[0]?.payload;
  if (!active || !day) return null;
  return (
    <TooltipShell title={day.label}>
      <TooltipRow label="Task hours" value={`${formatHours(day.taskHours)} h`} />
      <TooltipRow label="Attendance" value={day.attendanceHours === null ? 'Not recorded' : `${formatHours(day.attendanceHours)} h`} />
    </TooltipShell>
  );
}

function CountTooltip({ active, payload, unit }: TooltipProps<{ label: string; value: number }> & { unit: string }) {
  const bucket = payload?.[0]?.payload;
  if (!active || !bucket) return null;
  return (
    <TooltipShell title={bucket.label}>
      <TooltipRow label={unit[0].toUpperCase() + unit.slice(1)} value={String(bucket.value)} />
    </TooltipShell>
  );
}

function TooltipShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-border shadow-soft-lg rounded-xl border bg-white px-3.5 py-2.5 text-xs">
      <p className="text-foreground font-semibold">{title}</p>
      <dl className="text-muted-foreground mt-1.5 flex flex-col gap-0.5">{children}</dl>
    </div>
  );
}

function TooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt>{label}</dt>
      <dd className="text-foreground font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
