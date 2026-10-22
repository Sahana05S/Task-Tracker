import Link from 'next/link';
import { Download } from 'lucide-react';

import { COEFFICIENTS, FACTOR_LABELS, FACTORS } from '@/modules/scoring/client';
import { DAILY_PERF_STATUS_LABEL, type DailyPerfFilter, type DailyPerfLog, type DailyPerfRow } from '@/modules/reports/client';
import { Exact } from '@/shared/math/exact';
import { buttonVariants } from '@/shared/ui/button';
import { MissionNotice } from '@/shared/ui/mission-ui';
import { UnavailableValue } from '@/shared/ui/unavailable-value';
import { cn } from '@/shared/utils';

const STATUS_TONE: Record<DailyPerfRow['status'], string> = {
  calculated: 'text-foreground',
  uncertified: 'text-attention-foreground bg-attention-subtle rounded-full px-2 py-0.5',
  not_calculated: 'text-muted-foreground',
};

/**
 * "Daily perf log": one row per member per day from retained daily award
 * runs, grouped by day, newest first. Collapsed, and not read at all, until
 * the URL asks for it (`log=1` or a filter), so applying a filter keeps it
 * open. The filter form keeps the page's month and as-of view. Members only
 * ever get their own rows.
 */
export async function DailyPerfLogSection({
  log,
  filter,
  period,
  asOf,
  canChooseMember,
  canRequest,
}: {
  /** The read, or null while the log has not been asked for. */
  log: Promise<DailyPerfLog> | null;
  filter: DailyPerfFilter;
  period: string;
  asOf?: string;
  /** Managers pick a member; members see only themselves. */
  canChooseMember: boolean;
  canRequest: boolean;
}) {
  let data: DailyPerfLog | null = null;
  try {
    data = await log;
  } catch (error) {
    console.error('Daily perf log read failed', error);
  }
  const csv = `/api/reports/export?${new URLSearchParams({ report: 'daily-log', from: filter.from, to: filter.to, ...(filter.member ? { member: filter.member } : {}) })}`;

  return (
    <details id="daily-perf-log" open={log !== null} className="soft-card group p-5 sm:p-6">
      <summary className="cursor-pointer list-none">
        <h2 className="text-foreground inline text-base font-bold tracking-tight">Daily perf log</h2>
        <span className="text-muted-foreground ml-2 text-xs">
          {data ? `${data.rows.length} member-days · ` : 'One row per member per day · '}
          {filter.from} to {filter.to}
        </span>
      </summary>
      <div className="mt-4 grid gap-4">
        <form method="get" action="/dashboard#daily-perf-log" className="grid gap-3 sm:flex sm:flex-wrap sm:items-end">
          <input type="hidden" name="period" value={period} />
          {asOf ? <input type="hidden" name="asOf" value={asOf} /> : null}
          <input type="hidden" name="log" value="1" />
          {canChooseMember && data ? (
            <label className="grid gap-1 text-xs font-medium">
              Member
              <select name="member" defaultValue={filter.member ?? ''} className="field h-10 min-w-44 bg-card">
                <option value="">Everyone</option>
                {data.options.map((member) => (
                  <option key={member.id} value={member.id}>{member.fullName}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="grid min-w-0 gap-1 text-xs font-medium">
            From
            <input type="date" name="from" defaultValue={filter.from} className="field h-10 w-full bg-card sm:w-auto" />
          </label>
          <label className="grid min-w-0 gap-1 text-xs font-medium">
            To
            <input type="date" name="to" defaultValue={filter.to} className="field h-10 w-full bg-card sm:w-auto" />
          </label>
          <div className="flex items-center gap-2 sm:contents">
            <button type="submit" className={buttonVariants({ variant: 'outline' })}>{log ? 'Apply' : 'Show log'}</button>
            <a href={csv} className={cn(buttonVariants({ variant: 'ghost' }), 'sm:ml-auto')}>
              <Download className="size-4" aria-hidden="true" />
              Download CSV
            </a>
          </div>
        </form>

        {!log ? (
          <p className="text-muted-foreground text-sm">Choose a date range and select Show log to read the retained daily runs.</p>
        ) : !data ? (
          <MissionNotice tone="attention">
            Daily award runs or logged hours could not be read, so the log is unavailable. Try again shortly.
          </MissionNotice>
        ) : (
          <>
            <p className="text-muted-foreground text-xs">
              Factors are the difference from the team median (six decimals); Sum is the shared score (two decimals).
              Days without a retained daily run read Not calculated
              {canRequest ? (
                <>
                  {'; fill one with '}
                  <Link href="/team" className="text-primary font-medium underline-offset-2 hover:underline">Request calculation on Team</Link>
                </>
              ) : null}
              .
            </p>
            {data.rows.length === 0 ? (
              <p className="text-muted-foreground text-sm">No members are in scope for these filters.</p>
            ) : (
              <DailyPerfTable log={data} />
            )}
          </>
        )}
      </div>
    </details>
  );
}

/** The log as a table, one body per day; a day without any retained run is one line (the CSV keeps every member-day). */
function DailyPerfTable({ log }: { log: DailyPerfLog }) {
  return (
    <div className="border-border relative overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[68rem] text-xs">
        <caption className="sr-only">Daily perf log, {log.from} to {log.to}</caption>
        <thead className="bg-muted/60 text-muted-foreground">
          <tr>
            <th scope="col" className="bg-muted sticky left-0 z-10 px-3 py-2 text-left font-semibold">Member</th>
            {FACTORS.map((factor) => (
              <th key={factor} scope="col" className="px-2 py-2 text-right font-semibold whitespace-nowrap">
                {FACTOR_LABELS[factor]}
                <span className="block font-normal">×{COEFFICIENTS[factor]}</span>
              </th>
            ))}
            <th scope="col" className="px-2 py-2 text-right font-semibold">Sum</th>
            <th scope="col" className="px-2 py-2 text-right font-semibold whitespace-nowrap">Hours logged</th>
            <th scope="col" className="px-3 py-2 text-left font-semibold">Status</th>
          </tr>
        </thead>
        {groupByDate(log.rows).map(([date, rows]) => {
          const empty = rows.every((row) => row.status === 'not_calculated');
          return (
            <tbody key={date} className="border-border border-t">
              <tr>
                <th scope="colgroup" colSpan={FACTORS.length + 4} className={cn('text-foreground bg-card px-3 text-left font-semibold', empty ? 'py-2.5' : 'pt-3 pb-1')}>
                  <span className="sticky left-3 inline-block">
                    {longDay(date)}
                    {empty ? (
                      <span className="text-muted-foreground ml-2 font-normal">
                        Not calculated · no retained daily run · {totalHours(rows)} h logged
                      </span>
                    ) : null}
                  </span>
                </th>
              </tr>
              {empty ? null : rows.map((row) => (
                <tr key={row.userId} className="hover:bg-muted/40">
                  <th scope="row" className="text-foreground sticky left-0 z-10 max-w-40 truncate bg-card px-3 py-1.5 text-left font-medium">
                    {row.fullName}
                  </th>
                  {row.status === 'not_calculated' ? (
                    <td colSpan={FACTORS.length + 1} className="text-muted-foreground px-2 py-1.5">
                      No retained daily run
                    </td>
                  ) : (
                    <>
                      {FACTORS.map((factor) => (
                        <td key={factor} className="tabular px-2 py-1.5 text-right whitespace-nowrap">
                          {row.factors[factor] ?? <UnavailableValue reason="this factor was unavailable in the run" />}
                        </td>
                      ))}
                      <td className="tabular text-foreground px-2 py-1.5 text-right font-semibold">
                        {row.sum ?? <UnavailableValue reason="incomplete, some factors are unavailable" className="font-normal" />}
                      </td>
                    </>
                  )}
                  <td className="tabular px-2 py-1.5 text-right">{row.hours}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <span className={STATUS_TONE[row.status]}>{DAILY_PERF_STATUS_LABEL[row.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

function totalHours(rows: readonly DailyPerfRow[]): string {
  return rows.reduce((sum, row) => sum.add(Exact.from(row.hours)), Exact.from(0)).display(2);
}

function groupByDate(rows: readonly DailyPerfRow[]): [string, DailyPerfRow[]][] {
  const groups = new Map<string, DailyPerfRow[]>();
  for (const row of rows) {
    const day = groups.get(row.date);
    if (day) day.push(row);
    else groups.set(row.date, [row]);
  }
  return [...groups];
}

function longDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
