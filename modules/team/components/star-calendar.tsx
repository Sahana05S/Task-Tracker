import { StarIcon } from 'lucide-react';

import type { EmployeeStarDay, StarDayState } from '@/modules/team/internal/employee-charts';
import { formatDate } from '@/shared/tracker/format';
import { MissionPanel } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';

const STYLE: Record<StarDayState, string> = {
  star: 'bg-recognition border-recognition',
  other: 'bg-white border-[#c9c4e3]',
  none: 'bg-white border-[#c9c4e3]',
  waiting: 'bg-attention-subtle border-[#f5c58a] border-dashed',
  pending: 'bg-muted border-[#d9d5ec] border-dashed',
};
const LABEL: Record<StarDayState, string> = {
  star: 'Daily star',
  other: 'Another member’s star',
  none: 'No winner',
  waiting: 'Waiting for data',
  pending: 'Not calculated',
};
const LEGEND: readonly StarDayState[] = ['star', 'other', 'waiting', 'pending'];
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Blank cells before the first day so columns are Monday to Sunday. */
function mondayOffset(iso: string): number {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * The workbook's DAILY STAR LOG for one member: a square per day of the month
 * so far, filled where this member was the certified daily star.
 */
export function StarCalendar({ days }: { days: readonly EmployeeStarDay[] }) {
  const stars = days.filter((d) => d.state === 'star').length;
  return (
    <MissionPanel icon={StarIcon} title="Daily star log" subtitle={`${stars} daily star${stars === 1 ? '' : 's'} this month`}>
      {days.length === 0 ? (
        <p className="text-muted-foreground text-sm">The month has not started yet.</p>
      ) : (
        <div className="grid gap-3">
          <ol className="grid w-fit grid-cols-7 gap-1.5" aria-label="Daily star by day">
            {WEEKDAYS.map((w, i) => <li key={`h${i}`} aria-hidden="true" className="text-muted-foreground text-center text-[10px] font-semibold">{w}</li>)}
            {Array.from({ length: mondayOffset(days[0].date) }, (_, i) => <li key={`b${i}`} aria-hidden="true" />)}
            {days.map((d) => (
              <li
                key={d.date}
                title={`${formatDate(d.date)}: ${LABEL[d.state]}`}
                className={cn('text-muted-foreground flex size-7 items-center justify-center rounded-md border text-[10px] font-medium tabular-nums', STYLE[d.state], d.state === 'star' && 'text-recognition-foreground font-bold')}
              >
                <span aria-hidden="true">{Number(d.date.slice(8))}</span>
                <span className="sr-only">{formatDate(d.date)}: {LABEL[d.state]}</span>
              </li>
            ))}
          </ol>
          <p className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {LEGEND.map((s) => (
              <span key={s} className="inline-flex items-center gap-1">
                <span aria-hidden="true" className={cn('inline-block size-2.5 rounded-sm border', STYLE[s])} />
                {s === 'other' ? 'Decided, not this member' : LABEL[s]}
              </span>
            ))}
          </p>
        </div>
      )}
    </MissionPanel>
  );
}
