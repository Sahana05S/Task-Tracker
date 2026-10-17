'use client';
import { displayPerformance } from '@/lib/performance/exact';

import * as React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import {
  ChartShell,
  EmptyNote,
} from '@/components/dashboard/productivity-chart';
import { seriesColor } from '@/components/dashboard/chart-palette';
import type { MemberPerformance } from '@/lib/analytics/engine';
import { formatNumeric } from '@/shared/tracker/format';
import { cn } from '@/shared/utils';

export interface AllocationChartProps {
  members: readonly MemberPerformance[];
  medianAllocation: number | null;
  medianCriticality: number | null;
}

interface Datum {
  fullName: string;
  allocationPercent: number;
  taskScale: number;
  taskCount: number;
  loadingDiff: number | null;
  criticalityScore: number | null;
  color: string;
}

/**
 * Priority and workload distribution.
 *
 * A donut, because allocation percentages are shares of one total and sum to
 * 100: the ring makes that constraint visible in a way parallel bars do not.
 *
 * The legend beside it carries the numbers the ring cannot: each member's
 * loading differential against the median, and their criticality score, which is
 * the priority half of the picture.
 */
export function AllocationChart({
  members,
  medianAllocation,
  medianCriticality,
}: AllocationChartProps) {
  const data: Datum[] = React.useMemo(
    () =>
      members
        .filter((member):member is MemberPerformance & {allocationPercent:number} => member.allocationPercent !== null && member.allocationPercent > 0)
        .sort((a, b) => b.allocationPercent - a.allocationPercent)
        .map((member, index) => ({
          fullName: member.fullName,
          allocationPercent: member.allocationPercent,
          taskScale: member.taskScale,
          taskCount: member.taskCount,
          loadingDiff: member.loadingDiff,
          criticalityScore: member.criticalityScore,
          color: seriesColor(index),
        })),
    [members],
  );

  const unloaded = members.filter(
    (member) => member.allocationPercent === 0,
  ).length;
  const unavailable=members.some(member=>member.allocationPercent===null);
  const remainder=100-data.reduce((sum,member)=>sum+member.allocationPercent,0);
  const ringData=!unavailable && remainder>0.000001 ? [...data,{fullName:'Inactive assigned share',allocationPercent:remainder,taskScale:0,taskCount:0,loadingDiff:null,criticalityScore:null,color:'#94a3b8'}] : data;

  if (data.length === 0 || unavailable) {
    return (
      <ChartShell
        title="Priority & workload distribution"
        subtitle="Share of total team task scale per member"
      >
        <EmptyNote>
          Workload shares are unavailable or no eligible workload is assigned in this period.
        </EmptyNote>
      </ChartShell>
    );
  }

  return (
    <ChartShell
      title="Priority & workload distribution"
      subtitle="Share of total team task scale per member"
      footer={
        unloaded > 0
          ? `${unloaded} active ${unloaded === 1 ? 'member carries' : 'members carry'} no metric-eligible workload this period.`
          : undefined
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div className="soft-inset h-56 w-full p-2">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip content={<AllocationTooltip />} />
              <Pie
                data={ringData}
                dataKey="allocationPercent"
                nameKey="fullName"
                innerRadius="58%"
                outerRadius="85%"
                paddingAngle={2}
                strokeWidth={1}
                stroke="var(--color-white)"
              >
                {ringData.map((datum) => (
                  <Cell key={datum.fullName} fill={datum.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend doubles as the numeric table. */}
        <table className="w-full text-xs">
          <caption className="sr-only">
            Task allocation percentage, loading differential and criticality
            score per member
          </caption>
          <thead>
            <tr className="text-muted-foreground">
              <th scope="col" className="py-1.5 text-left font-semibold">
                Member
              </th>
              <th scope="col" className="py-1.5 text-right font-semibold">
                Share
              </th>
              <th scope="col" className="py-1.5 text-right font-semibold">
                vs median
              </th>
              <th scope="col" className="py-1.5 text-right font-semibold">
                Criticality
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((datum) => (
              <tr key={datum.fullName} className="border-border border-t">
                <th scope="row" className="py-1.5 text-left font-normal">
                  <span className="flex items-center gap-2">
                    {/* Colour key. Recharts fills SVG by prop, so the swatch
                        takes the same token to stay in step with the ring. */}
                    <svg
                      className="size-2.5 shrink-0"
                      viewBox="0 0 10 10"
                      aria-hidden="true"
                    >
                      <circle cx="5" cy="5" r="5" fill={datum.color} />
                    </svg>
                    <span className="text-foreground truncate font-medium">
                      {datum.fullName}
                    </span>
                  </span>
                </th>
                <td className="text-foreground py-1.5 text-right font-semibold tabular">
                  {formatNumeric(datum.allocationPercent)}%
                </td>
                <td
                  className={cn(
                    'py-1.5 text-right font-medium tabular',
                    datum.loadingDiff === null
                      ? 'text-slate-400'
                      : datum.loadingDiff >= 0
                        ? 'text-emerald-700'
                        : 'text-rose-700',
                  )}
                >
                  {datum.loadingDiff === null
                    ? '\u2014'
                    : `${datum.loadingDiff >= 0 ? '+' : ''}${formatNumeric(datum.loadingDiff*100)} pp`}
                </td>
                <td className="text-foreground py-1.5 text-right tabular">
                  {displayPerformance(datum.criticalityScore)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-border text-muted-foreground border-t">
              <th scope="row" className="py-1.5 text-left font-semibold">
                Team median
              </th>
              <td className="py-1.5 text-right tabular">
                {medianAllocation === null
                  ? '\u2014'
                  : `${formatNumeric(medianAllocation)}%`}
              </td>
              <td className="py-1.5 text-right">—</td>
              <td className="py-1.5 text-right tabular">
                {formatNumeric(medianCriticality)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ChartShell>
  );
}

/* -------------------------------------------------------------------------- */

interface TooltipPayloadEntry {
  payload?: Datum;
}

function AllocationTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly TooltipPayloadEntry[];
}) {
  const datum = payload?.[0]?.payload;
  if (!active || !datum) return null;

  return (
    <div className="border-border rounded-xl border bg-white px-3.5 py-2.5 text-xs shadow-soft-lg">
      <p className="text-foreground font-semibold">{datum.fullName}</p>
      <dl className="text-muted-foreground mt-1.5 flex flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-4">
          <dt>Allocation</dt>
          <dd className="font-medium text-slate-900 tabular">
            {formatNumeric(datum.allocationPercent)}%
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt>Task scale</dt>
          <dd className="font-medium text-slate-900 tabular">
            {formatNumeric(datum.taskScale)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt>Tasks carried</dt>
          <dd className="font-medium text-slate-900 tabular">
            {datum.taskCount}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt>Criticality</dt>
          <dd className="font-medium text-slate-900 tabular">
            {displayPerformance(datum.criticalityScore)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
