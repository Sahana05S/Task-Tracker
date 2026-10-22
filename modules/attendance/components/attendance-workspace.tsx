import Link from 'next/link';
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

import type { AttendanceMatrixModel } from '@/modules/attendance/client';
import { HelpTip } from '@/shared/ui/help-tip';
import { EmptyState, MissionNotice, MissionPage, MissionPageHeader, MissionPanel } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';
import { AttendanceDayFill } from './attendance-day-fill';
import { AttendanceMatrix } from './attendance-matrix';

const MONTH_LABEL = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const shortMonth = (month: string) => MONTH_LABEL.format(new Date(`${month}-01T00:00:00Z`));

/**
 * The `/attendance` page body: one month as a members-by-days matrix. Each
 * elapsed day needs a record; click a day to record or correct it, and
 * managers can fill a day for everyone.
 */
export function AttendanceWorkspace({ model, periodLabel, previous, next, editable, canFill, monthError }: {
  model: AttendanceMatrixModel;
  periodLabel: string;
  previous: string;
  /** Null when the next month has not started. */
  next: string | null;
  /** Member ids the viewer may record for. */
  editable: readonly string[];
  canFill: boolean;
  monthError: string | null;
}) {
  const missing = model.rows.reduce((sum, row) => sum + row.missing, 0);
  const elapsed = model.days.filter(day => day.kind !== 'future');
  const lastDay = elapsed.at(-1)?.date ?? null;
  const nav = 'border-border text-foreground hover:bg-muted focus-visible:outline-primary inline-flex min-h-10 items-center gap-1 rounded-full border px-3 text-sm font-semibold';
  return (
    <MissionPage wide>
      <MissionPageHeader
        eyebrow="Records"
        title="Attendance"
        description={`${periodLabel} · ${missing ? `${missing} ${missing === 1 ? 'day' : 'days'} not recorded` : elapsed.length ? 'every day recorded' : 'the month has not started'}`}
        actions={
          <nav aria-label="Month" className="flex items-center gap-2">
            <Link href={`/attendance?month=${previous}`} className={nav}><ChevronLeftIcon className="size-4" aria-hidden="true" />{shortMonth(previous)}</Link>
            {next ? <Link href={`/attendance?month=${next}`} className={nav}>{shortMonth(next)}<ChevronRightIcon className="size-4" aria-hidden="true" /></Link>
              : <span className={cn(nav, 'text-muted-foreground pointer-events-none opacity-60')} aria-disabled="true">{shortMonth(model.month)}<ChevronRightIcon className="size-4" aria-hidden="true" /></span>}
          </nav>
        }
      />
      {monthError ? <MissionNotice tone="attention" role="status">{monthError}</MissionNotice> : null}
      <p className="text-muted-foreground flex flex-wrap items-center text-sm">
        Record every day that has passed. Time logged on missions each day must fit within regular hours plus off-hours.
        <HelpTip tip="gate" />
      </p>
      <MissionPanel icon={CalendarDaysIcon} title={periodLabel} subtitle={editable.length ? 'Select a day to record or correct it.' : undefined}>
        {model.rows.length ? (
          <div className="grid gap-4">
            {canFill ? <AttendanceDayFill model={model} lastDay={lastDay} /> : null}
            <AttendanceMatrix model={model} editable={editable} />
          </div>
        ) : (
          <EmptyState title="Nobody to show yet" action={<Link href="/team" className="link text-sm">Open Team</Link>}>
            Attendance appears here for every active member.
          </EmptyState>
        )}
      </MissionPanel>
    </MissionPage>
  );
}
