'use client';
import { displayPerformance } from '@/shared/math/exact';

import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  CHART_AXIS,
  CHART_GRID,
  CHART_NEGATIVE,
  CHART_POSITIVE,
  CHART_REFERENCE,
  shortName,
} from '@/shared/ui/chart-palette';
import type { MemberPerformance } from '@/modules/scoring/client';
import { formatHours } from '@/shared/tracker/format';

export interface ProductivityChartProps {
  members: readonly MemberPerformance[];
  medianProductivity: number | null;
}

interface Datum {
  name: string;
  fullName: string;
  productivity: number;
  differential: number | null;
  hoursLogged: number;
  scaledProgress: number|null;
}

/**
 * Productivity differentials.
 *
 * One bar per contributing member against a reference line at the team median,
 * so the differential is the visible gap rather than a number to be looked up.
 * Bars above the median read emerald, below it rose.
 *
 * Members with unavailable attendance or earned credit are omitted from the rate comparison.
 */
export function ProductivityChart({
  members,
  medianProductivity,
}: ProductivityChartProps) {
  const data: Datum[] = React.useMemo(
    () =>
      members
        .filter(
          (member): member is MemberPerformance & { productivity: number } =>
            member.productivity !== null,
        )
        .sort((a, b) => b.productivity - a.productivity)
        .map((member) => ({
          name: shortName(member.fullName),
          fullName: member.fullName,
          productivity: member.productivity,
          differential: member.productivityDiff,
          hoursLogged: member.hoursLogged,
          scaledProgress: member.scaledProgress,
        })),
    [members],
  );

  const omitted = members.length - data.length;

  if (data.length === 0) {
    return (
      <ChartShell
        title="Productivity differentials"
        subtitle="Period scaled credit per regular attendance hour against the factor median"
      >
        <EmptyNote>
          Productivity inputs are unavailable; a rate cannot be compared.
        </EmptyNote>
      </ChartShell>
    );
  }

  return (
    <ChartShell
      title="Productivity differentials"
      subtitle="Period scaled credit per regular attendance hour against the factor median"
      footer={
        omitted > 0
          ? `${omitted} ${omitted === 1 ? 'member' : 'members'} omitted: attendance or earned-credit inputs are unavailable.`
          : undefined
      }
    >
      {/* Recharts needs a pixel height; the container supplies the width. The
          recessed panel keeps the plot visually inside the card. */}
      <div className="soft-inset h-64 w-full p-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
            barCategoryGap="25%"
          >
            <CartesianGrid stroke={CHART_GRID} vertical={false} />
            <XAxis
              dataKey="name"
              stroke={CHART_AXIS}
              tickLine={false}
              axisLine={{ stroke: CHART_GRID }}
              fontSize={11}
              interval={0}
            />
            <YAxis
              stroke={CHART_AXIS}
              tickLine={false}
              axisLine={false}
              fontSize={11}
              width={40}
            />
            <Tooltip
              cursor={{ fill: 'var(--color-muted)', radius: 8 }}
              content={<ProductivityTooltip />}
            />
            {medianProductivity !== null ? (
              <ReferenceLine
                y={medianProductivity}
                stroke={CHART_REFERENCE}
                strokeDasharray="4 4"
                label={{
                  value: `Median ${displayPerformance(medianProductivity)}`,
                  position: 'insideTopRight',
                  fill: CHART_REFERENCE,
                  fontSize: 11,
                }}
              />
            ) : null}
            {/* Generous cap radius, matching the rounded language of the cards. */}
            <Bar dataKey="productivity" radius={[8, 8, 4, 4]}>
              {data.map((datum) => (
                <Cell
                  key={datum.fullName}
                  fill={
                    datum.differential !== null && datum.differential < 0
                      ? CHART_NEGATIVE
                      : CHART_POSITIVE
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Tooltip                                                                    */
/* -------------------------------------------------------------------------- */

interface TooltipPayloadEntry {
  payload?: Datum;
}

interface ProductivityTooltipProps {
  active?: boolean;
  payload?: readonly TooltipPayloadEntry[];
}

/**
 * Custom tooltip.
 *
 * Typed against the narrow shape actually used rather than Recharts' own
 * generic tooltip props, which resolve loosely and would otherwise force a cast.
 */
function ProductivityTooltip({ active, payload }: ProductivityTooltipProps) {
  const datum = payload?.[0]?.payload;
  if (!active || !datum) return null;

  return (
    <div className="border-border rounded-xl border bg-white px-3.5 py-2.5 text-xs shadow-soft-lg">
      <p className="text-foreground font-semibold">{datum.fullName}</p>
      <dl className="text-muted-foreground mt-1.5 flex flex-col gap-0.5">
        <Row
          label="Productivity"
          value={`${displayPerformance(datum.productivity)} /h`}
        />
        <Row
          label="vs median"
          value={
            datum.differential === null
              ? '\u2014'
              : `${datum.differential >= 0 ? '+' : ''}${displayPerformance(datum.differential)}`
          }
        />
        <Row
          label="Scaled progress"
          value={displayPerformance(datum.scaledProgress)}
        />
        <Row label="Task hours (actual effort)" value={formatHours(datum.hoursLogged)} />
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt>{label}</dt>
      <dd className="text-foreground font-semibold tabular">
        {value}
      </dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shell                                                                      */
/* -------------------------------------------------------------------------- */

export function ChartShell({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle: string;
  footer?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="soft-card flex flex-col gap-4 p-5 sm:p-6">
      <header className="flex flex-col gap-0.5">
        <h3 className="text-foreground text-base font-bold tracking-tight">{title}</h3>
        <p className="text-muted-foreground text-xs">{subtitle}</p>
      </header>
      {children}
      {footer ? (
        <p className="text-muted-foreground text-xs">{footer}</p>
      ) : null}
    </section>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="soft-inset text-muted-foreground flex h-64 items-center justify-center px-6 text-center text-sm">
      {children}
    </p>
  );
}
