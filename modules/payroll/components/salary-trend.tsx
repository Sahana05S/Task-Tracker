'use client';

import { BadgeIndianRupeeIcon, GiftIcon, TrendingUpIcon, WalletIcon } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { formatINR, monthLabel, salaryTrend, type SalaryHistory, type TrendPoint } from '@/modules/payroll/client';
import { CHART_AXIS, CHART_GRID, CHART_POSITIVE, SERIES_COLORS } from '@/shared/ui/chart-palette';
import { EmptyState, StatTile } from '@/shared/ui/mission-ui';

const SALARY = SERIES_COLORS[0];
const IN_HAND = SERIES_COLORS[1];
const INCENTIVE = CHART_POSITIVE;
const TICK = { fontSize: 11, fill: CHART_AXIS };

const compactINR = (value: number) =>
  value >= 100000 ? `₹${(value / 100000).toFixed(1)}L` : value >= 1000 ? `₹${Math.round(value / 1000)}k` : `₹${value}`;

/**
 * Salary over time (M19): the base salary as a step line, in-hand pay and
 * incentives as bars per finalised month, the increment history and April-to-
 * March totals. Used on My salary and on the managing director's pay file.
 */
export function SalaryTrend({ history, asOfPeriod, subject }: {
  history: SalaryHistory;
  /** The current month ("YYYY-MM-01"), for the salary in effect now. */
  asOfPeriod: string;
  /** "Your" or the person's name, for the copy. */
  subject: string;
}) {
  const trend = salaryTrend(history, asOfPeriod);
  const thisYear = trend.years[0];
  return (
    <div className="grid gap-5 lg:gap-6">
      <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile icon={BadgeIndianRupeeIcon} label="Monthly salary now" value={formatINR(trend.currentSalary)} />
        <StatTile
          icon={TrendingUpIcon}
          label="Growth since first salary"
          value={trend.growth ? formatINR(trend.growth.change) : '—'}
          note={trend.growth?.percent != null ? `${trend.growth.percent > 0 ? '+' : ''}${trend.growth.percent}%` : 'One salary so far'}
          tone={trend.growth && trend.growth.change > 0 ? 'success' : 'default'}
        />
        <StatTile icon={WalletIcon} label={thisYear ? `In hand · ${thisYear.label}` : 'In hand this year'} value={formatINR(thisYear?.inHand ?? null)} note={thisYear ? `${thisYear.months} month${thisYear.months === 1 ? '' : 's'}` : undefined} />
        <StatTile icon={GiftIcon} label={thisYear ? `Incentives · ${thisYear.label}` : 'Incentives this year'} value={formatINR(thisYear?.incentives ?? null)} />
      </dl>

      <Section title="Salary over time" subtitle={`${subject} monthly salary, in-hand pay and incentives for each finalised month.`}>
        {trend.points.length === 0 ? (
          <EmptyState variant="chart">No finalised salary months yet. Each month appears here once the managing director finalises payroll.</EmptyState>
        ) : (
          <>
            <Legend />
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trend.points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: CHART_GRID }} />
                  <YAxis tick={TICK} tickLine={false} axisLine={false} width={52} tickFormatter={compactINR} />
                  <Tooltip content={<PointTooltip />} cursor={{ fill: 'var(--color-muted)' }} />
                  <Bar dataKey="inHand" name="In hand" fill={IN_HAND} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="incentives" name="Incentives" fill={INCENTIVE} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Line type="stepAfter" dataKey="monthlySalary" name="Monthly salary" stroke={SALARY} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </Section>

      <div className="grid gap-5 lg:gap-6 xl:grid-cols-2">
        <Section title="Increments" subtitle="Each salary revision and the change from the one before.">
          {trend.increments.length === 0 ? (
            <EmptyState>No salary has been set yet.</EmptyState>
          ) : (
            <ul className="divide-border grid divide-y text-sm">
              {[...trend.increments].reverse().map(increment => (
                <li key={increment.effectiveFrom} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                  <span className="text-foreground font-medium">{monthLabel(increment.effectiveFrom)}</span>
                  <span className="tabular-nums">
                    <span className="text-foreground font-semibold">{formatINR(increment.to)}</span>
                    <span className="text-muted-foreground text-xs">
                      {increment.change === null
                        ? ' · starting salary'
                        : ` · ${increment.change >= 0 ? '+' : '−'}${formatINR(Math.abs(increment.change))}${increment.percent === null ? '' : ` (${increment.percent > 0 ? '+' : ''}${increment.percent}%)`}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Totals by financial year" subtitle="April to March. Incentives are the amounts entered each month.">
          {trend.years.length === 0 ? (
            <EmptyState>No finalised months yet.</EmptyState>
          ) : (
            <div className="grid gap-3">
              {trend.years.map(year => (
                <div key={year.startYear} className="border-border rounded-xl border px-3.5 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-foreground text-sm font-semibold">{year.label}</span>
                    <span className="text-muted-foreground text-xs">{year.months} month{year.months === 1 ? '' : 's'}</span>
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <Figure label="In hand" value={formatINR(year.inHand)} />
                    <Figure label="Incentives" value={formatINR(year.incentives)} />
                    <Figure label="Deductions" value={formatINR(year.deductions)} />
                  </dl>
                  {year.incentivesByName.length ? (
                    <p className="text-muted-foreground mt-2 text-xs">
                      {year.incentivesByName.map(item => `${item.name} ${formatINR(item.amount)}`).join(' · ')}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {history.months.length ? (
        <Section title="Month by month" subtitle="The frozen record of each finalised month.">
          <div className="border-border overflow-x-auto rounded-xl border">
            <table className="sheet-grid min-w-[44rem]">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="text-right">Monthly salary</th>
                  <th className="text-right">Days worked</th>
                  <th className="text-right">Incentives</th>
                  <th className="text-right">Deductions</th>
                  <th className="text-right">In hand</th>
                </tr>
              </thead>
              <tbody>
                {[...history.months].sort((a, b) => b.period.localeCompare(a.period)).map(month => (
                  <tr key={month.period}>
                    <td className="text-xs font-medium">{monthLabel(month.period)}</td>
                    <td className="sheet-numeric text-xs">{formatINR(month.monthlySalary)}</td>
                    <td className="sheet-numeric text-xs">{month.daysWorked}</td>
                    <td className="sheet-numeric text-xs" title={month.breakdown.incentives.map(item => `${item.name} ${formatINR(item.amount)}`).join(', ')}>
                      {formatINR(month.incentiveTotal)}
                    </td>
                    <td className="sheet-numeric text-xs">{formatINR(month.fixedTotal + month.variableTotal)}</td>
                    <td className="sheet-numeric text-xs font-semibold">{formatINR(month.inHand)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="soft-card grid min-w-0 content-start gap-4 p-5 sm:p-6">
      <header className="grid gap-0.5">
        <h2 className="text-foreground text-base font-bold tracking-tight">{title}</h2>
        <p className="text-muted-foreground text-xs">{subtitle}</p>
      </header>
      {children}
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Legend() {
  const items = [
    { label: 'Monthly salary', color: SALARY, line: true },
    { label: 'In hand', color: IN_HAND },
    { label: 'Incentives', color: INCENTIVE },
  ];
  return (
    <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legend">
      {items.map(item => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <svg aria-hidden="true" width="18" height="8" className="shrink-0">
            {item.line
              ? <line x1="0" y1="4" x2="18" y2="4" stroke={item.color} strokeWidth="2" />
              : <rect x="0" y="1" width="18" height="6" rx="3" fill={item.color} />}
          </svg>
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function PointTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: TrendPoint }[] }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="border-border shadow-soft-lg bg-card rounded-xl border px-3.5 py-2.5 text-xs">
      <p className="text-foreground font-semibold">{monthLabel(point.period)}</p>
      <dl className="text-muted-foreground mt-1.5 flex flex-col gap-0.5">
        {[
          ['Monthly salary', formatINR(point.monthlySalary)],
          ['In hand', formatINR(point.inHand)],
          ['Incentives', formatINR(point.incentives)],
          ['Deductions', formatINR(point.deductions)],
        ].map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4">
            <dt>{label}</dt>
            <dd className="text-foreground font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
