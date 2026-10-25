import Link from 'next/link';
import { CalendarCheckIcon, CircleCheckIcon, ListChecksIcon, StarIcon } from 'lucide-react';

import type { LivePresentation } from '@/modules/reports/internal/presentation/model';
import { codeLabels } from '@/shared/tracker/labels';
import { shortDay } from '@/shared/ui/as-of-note';
import { EmptyState, MissionPanel } from '@/shared/ui/mission-ui';

const DECIDED = new Set(['completed_winner', 'completed_none']);

function dayList(dates: readonly string[]): string {
  const shown = dates.slice(0, 8).map(shortDay).join(', ');
  return dates.length > 8 ? `${shown} and ${dates.length - 8} more` : shown;
}

/**
 * Reports > Data checks, for the managing director only: the one place that lists what is
 * missing for scores and awards (user decision, 25 October 2026; no other page warns).
 * Attendance days with no or invalid records, award days not decided yet, and open
 * missions without dates, each with where to fix it.
 */
export function DataChecks({ model }: { model: LivePresentation }) {
  const month = model.view.period.startDate.slice(0, 7);
  const names = new Map(model.members.map((m) => [m.id, m.fullName]));
  const attendance = model.attendance
    .map((a) => ({
      userId: a.userId,
      missing: a.days.filter((d) => d.attendanceId === null).map((d) => d.businessDate),
      invalid: a.days.filter((d) => d.attendanceId !== null && d.valid === false).map((d) => ({ date: d.businessDate, reasons: d.reasons })),
    }))
    .filter((a) => a.missing.length || a.invalid.length);
  const undecided = (model.awards?.days ?? []).filter((d) => !DECIDED.has(d.status));
  const undated = model.tasks.filter((t) => t.status !== 'Done' && t.status !== 'Discarded' && (!t.assignedDate || !t.dueDate));
  const clear = !attendance.length && !undecided.length && !undated.length;

  return (
    <div className="grid gap-5">
      {clear ? (
        <EmptyState icon={CircleCheckIcon} title="Everything is recorded">
          Attendance, award days and mission dates are complete for {model.view.period.label}.
        </EmptyState>
      ) : null}
      {attendance.length ? (
        <MissionPanel
          icon={CalendarCheckIcon}
          title="Attendance to fill in"
          subtitle="Days without a record, or whose hours don't cover the time logged."
          action={<Link href={`/attendance?month=${month}`} className="text-primary text-sm font-medium hover:underline">Open attendance</Link>}
        >
          <ul className="divide-border divide-y text-sm">
            {attendance.map((a) => (
              <li key={a.userId} className="grid gap-0.5 py-2.5">
                <span className="text-foreground font-medium">{names.get(a.userId) ?? 'Team member'}</span>
                {a.missing.length ? <span className="text-muted-foreground">No record: {dayList(a.missing)}</span> : null}
                {a.invalid.map((d) => (
                  <span key={d.date} className="text-muted-foreground">{shortDay(d.date)}: {codeLabels(d.reasons) || 'needs a correction'}</span>
                ))}
              </li>
            ))}
          </ul>
        </MissionPanel>
      ) : null}
      {undecided.length ? (
        <MissionPanel icon={StarIcon} title="Award days not decided yet" subtitle="The nightly run retries these once the records above are complete.">
          <ul className="divide-border divide-y text-sm">
            {undecided.map((d) => (
              <li key={d.date} className="flex flex-wrap gap-x-3 py-2.5">
                <span className="text-foreground w-20 font-medium">{shortDay(d.date)}</span>
                <span className="text-muted-foreground min-w-0 flex-1">{d.reasons?.length ? codeLabels(d.reasons) : 'Waiting for the nightly run'}</span>
              </li>
            ))}
          </ul>
        </MissionPanel>
      ) : null}
      {undated.length ? (
        <MissionPanel icon={ListChecksIcon} title="Missions without dates" subtitle="Open missions need an assigned and a due date for freshness and awards.">
          <ul className="divide-border divide-y text-sm">
            {undated.map((t) => (
              <li key={t.id} className="flex flex-wrap gap-x-3 py-2.5">
                <Link href={`/tasks/${encodeURIComponent(t.taskTag)}`} className="text-primary font-mono text-xs hover:underline">{t.taskTag}</Link>
                <span className="text-foreground min-w-0 flex-1 truncate">{t.title}</span>
                <span className="text-muted-foreground text-xs">{!t.dueDate ? 'No due date' : 'No assigned date'}</span>
              </li>
            ))}
          </ul>
        </MissionPanel>
      ) : null}
    </div>
  );
}
