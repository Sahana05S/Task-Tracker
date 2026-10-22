import Link from 'next/link';
import { CalendarCheckIcon, CalendarClockIcon, ClipboardListIcon, HistoryIcon, MessageCircleIcon, TargetIcon } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { NativeSelect } from '@/shared/ui/native-select';
import { EmptyState, MissionNotice, MissionPanel, MissionProgress, StatTile } from '@/shared/ui/mission-ui';
import { formatDate, formatHours, formatPercent } from '@/shared/tracker/format';
import { codeLabel } from '@/shared/tracker/labels';
import { cn } from '@/shared/utils';
import type { LivePresentation } from '@/modules/reports/internal/presentation/model';
import { compiledLogs, dailyReport, formatDailyReport, longDate, type DailyReport, type ValidityState } from '@/modules/reports/internal/presentation/daily-report';
import { sumHours } from '@/modules/time-tracking/client';
import { TaskLogCompilation, TaskLogSummary } from './member-panels';
import { ShareText } from './share-text';

export interface DailyReportProps {
  model: LivePresentation;
  memberId: string;
  /** The report day (Asia/Kolkata). */
  date: string;
  /** Log compilation range, inclusive; defaults to month to date. */
  from: string;
  to: string;
  /** Latest selectable day (today). */
  maxDate: string;
  /** Managers pick any member; members see only themselves. */
  canPickMember: boolean;
}

/**
 * Reports > Daily report: one member's day as the workbook's Reports tab shows
 * it, with the WhatsApp message to send. Filters are plain GET forms.
 */
export function DailyReportView({ model, memberId, date, from, to, maxDate, canPickMember }: DailyReportProps) {
  const report = dailyReport(model, memberId, date);
  if (!report) return <MissionNotice tone="attention" role="status">This member is not in the selected month’s tracker.</MissionNotice>;
  const member = report.member;
  const compiled = compiledLogs(model, memberId, from, to);
  const monthHours = sumHours(compiledLogs(model, memberId, model.view.period.startDate, date));
  const members = model.members.filter((m) => m.isActive || m.id === memberId).sort((a, b) => a.fullName.localeCompare(b.fullName));

  return (
    <div className="grid gap-5 lg:gap-6">
      <form method="get" action="/reports" className="soft-card flex flex-wrap items-end gap-3 p-4 sm:p-5" aria-label="Choose report">
        {canPickMember ? (
          <label className="field-label min-w-48 flex-1 sm:flex-none">
            Member
            <NativeSelect name="member" defaultValue={member.employeeId}>
              {members.map((m) => <option key={m.id} value={m.employeeId}>{m.fullName} · {m.employeeId}</option>)}
            </NativeSelect>
          </label>
        ) : null}
        <label className="field-label min-w-40 flex-1 sm:flex-none">
          Day
          <Input type="date" name="date" defaultValue={date} max={maxDate} required />
        </label>
        <Button type="submit" variant="outline">Show report</Button>
        <p className="text-muted-foreground basis-full text-xs sm:ml-auto sm:basis-auto">{longDate(date)}</p>
      </form>

      <dl className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4" aria-label="Day summary">
        <StatTile icon={CalendarClockIcon} label="Today" value={formatHours(report.today.hours)} unit="h" note={plural(report.today.logs.length, 'log')} />
        <StatTile icon={HistoryIcon} label="Yesterday" value={report.yesterdayInPeriod ? formatHours(report.yesterday.hours) : '—'} unit={report.yesterdayInPeriod ? 'h' : undefined} note={report.yesterdayInPeriod ? plural(report.yesterday.logs.length, 'log') : 'Previous month'} />
        <StatTile icon={TargetIcon} label="Open missions" value={String(report.openMissions.length)} note={report.overdueIds.size ? `${report.overdueIds.size} overdue` : 'None overdue'} />
        <StatTile icon={ClipboardListIcon} label="Month to date" value={formatHours(monthHours)} unit="h" note={`Since ${formatDate(model.view.period.startDate)}`} />
      </dl>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6">
        <aside className="grid h-fit min-w-0 gap-5 lg:order-last lg:gap-6">
          <MissionPanel icon={MessageCircleIcon} title="Share as text" subtitle={`${member.fullName}’s own day: today, yesterday and open missions.`}>
            <ShareText text={formatDailyReport(report)} title={`Daily report · ${member.fullName}`} />
          </MissionPanel>
          <MissionPanel icon={CalendarCheckIcon} title="Report validity" subtitle="Attendance and logged effort per day this month.">
            <ValidityStrip report={report} />
          </MissionPanel>
        </aside>

        <div className="grid min-w-0 content-start gap-5 lg:gap-6">
          <section className="grid gap-5 xl:grid-cols-2 lg:gap-6">
            <MissionPanel icon={CalendarClockIcon} title={`Today · ${formatHours(report.today.hours)} h`} subtitle={formatDate(report.today.date)}>
              <TaskLogSummary logs={report.today.logs} tasks={model.tasks} empty="Nothing logged on this day yet." />
            </MissionPanel>
            <MissionPanel icon={HistoryIcon} title={report.yesterdayInPeriod ? `Yesterday · ${formatHours(report.yesterday.hours)} h` : 'Yesterday'} subtitle={formatDate(report.yesterday.date)}>
              {report.yesterdayInPeriod ? (
                <TaskLogSummary logs={report.yesterday.logs} tasks={model.tasks} empty="Nothing logged on this day." />
              ) : (
                <EmptyState>
                  This day belongs to the previous month.{' '}
                  <Link className="link" href={`/reports?${new URLSearchParams({ ...(canPickMember ? { member: member.employeeId } : {}), date: report.yesterday.date })}`}>Open its report</Link>
                </EmptyState>
              )}
            </MissionPanel>
          </section>

          <MissionPanel icon={TargetIcon} title={`Open missions · ${report.openMissions.length}`} subtitle={`Open on ${formatDate(date)}, by due date.${date < maxDate ? ' Progress is today’s.' : ''}`}>
            {report.openMissions.length === 0 ? (
              <EmptyState>No open missions.</EmptyState>
            ) : (
              <ul className="divide-border grid divide-y">
                {report.openMissions.map((t) => {
                  const overdue = report.overdueIds.has(t.id);
                  return (
                    <li key={t.id} className="grid gap-1.5 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_9rem_6.5rem] sm:items-center sm:gap-4">
                      <Link href={`/tasks/${encodeURIComponent(t.taskTag)}`} className="min-w-0 text-sm hover:underline">
                        <span className="task-tag text-primary">{t.taskTag}</span>
                        <span className="text-foreground"> · {t.title}</span>
                      </Link>
                      <span className="flex items-center gap-2 text-xs">
                        <MissionProgress value={t.progressPercentage} label={`${t.taskTag} progress`} className="flex-1" />
                        <span className="w-9 text-right tabular-nums">{formatPercent(t.progressPercentage)}</span>
                      </span>
                      <span className={cn('text-xs whitespace-nowrap sm:text-right', overdue ? 'text-danger font-semibold' : 'text-muted-foreground')}>
                        {t.dueDate ? `${overdue ? 'Overdue · ' : 'Due '}${formatDate(t.dueDate)}` : 'No due date'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </MissionPanel>

          <MissionPanel
            icon={ClipboardListIcon}
            title="Task logs compilation"
            subtitle={`${formatDate(from)} to ${formatDate(to)} · ${formatHours(sumHours(compiled))} h`}
          >
            <form method="get" action="/reports" className="mb-4 flex flex-wrap items-end gap-3" aria-label="Compilation range">
              {canPickMember ? <input type="hidden" name="member" value={member.employeeId} /> : null}
              <input type="hidden" name="date" value={date} />
              <label className="field-label">
                From
                <Input type="date" name="from" defaultValue={from} min={model.view.period.startDate} max={date} />
              </label>
              <label className="field-label">
                To
                <Input type="date" name="to" defaultValue={to} min={model.view.period.startDate} max={date} />
              </label>
              <Button type="submit" variant="outline">Apply range</Button>
            </form>
            <TaskLogCompilation logs={compiled} tasks={model.tasks} />
          </MissionPanel>
        </div>
      </div>
    </div>
  );
}

const VALIDITY_STYLE: Record<ValidityState, string> = {
  valid: 'bg-success border-success',
  invalid: 'bg-danger-subtle border-danger',
  unavailable: 'bg-muted border-border-strong border-dashed',
};
const VALIDITY_LABEL: Record<ValidityState, string> = {
  valid: 'Valid',
  invalid: 'Needs attention',
  unavailable: 'Not recorded',
};

/** One square per day up to the report day, with counts and the day's reasons. */
function ValidityStrip({ report }: { report: DailyReport }) {
  if (report.validity.length === 0) return <EmptyState>Attendance is not recorded for this month yet.</EmptyState>;
  const count = (state: ValidityState) => report.validity.filter((d) => d.state === state).length;
  const day = report.validity.find((d) => d.date === report.date);
  return (
    <div className="grid gap-3">
      <ol className="flex flex-wrap gap-1" aria-label="Validity by day">
        {report.validity.map((d) => (
          <li key={d.date} title={`${formatDate(d.date)}: ${VALIDITY_LABEL[d.state]}`} className={cn('size-4 rounded-[5px] border', VALIDITY_STYLE[d.state], d.date === report.date && 'ring-primary ring-2 ring-offset-1 ring-offset-card')}>
            <span className="sr-only">{formatDate(d.date)}: {VALIDITY_LABEL[d.state]}</span>
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {(['valid', 'invalid', 'unavailable'] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1">
            <span aria-hidden="true" className={cn('inline-block size-2.5 rounded-sm border', VALIDITY_STYLE[s])} />
            {VALIDITY_LABEL[s]} <span className="text-foreground font-semibold tabular-nums">{count(s)}</span>
          </span>
        ))}
      </p>
      {day && day.state !== 'valid' ? (
        <p className="text-sm">
          {formatDate(day.date)}: {VALIDITY_LABEL[day.state].toLowerCase()}
          {day.reasons.length ? <span className="text-muted-foreground"> · {day.reasons.map((r) => codeLabel(r)).join('; ')}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
