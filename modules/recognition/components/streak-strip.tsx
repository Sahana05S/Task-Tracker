import type { StreakDay } from '@/modules/recognition/client';
import { cn } from '@/shared/utils';

const LABEL: Record<StreakDay['state'], string> = {
  active: 'counted',
  skipped: 'not counted (holiday, leave, off hours or no attendance record)',
  broken: 'streak broken (absent, or nothing logged)',
  pending: 'today, not counted yet',
};

function shortDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

/** The last two weeks as dots: filled, hollow, red outline or dashed. */
export function StreakStrip({ days, className }: { days: readonly StreakDay[]; className?: string }) {
  return (
    <ol className={cn('flex flex-wrap items-center gap-1.5', className)} aria-label="Last 14 days">
      {days.map((day) => (
        <li key={day.date} title={`${shortDate(day.date)}: ${LABEL[day.state]}`} className={cn('streak-dot', `streak-dot-${day.state}`)}>
          <span className="sr-only">{shortDate(day.date)}: {LABEL[day.state]}</span>
        </li>
      ))}
    </ol>
  );
}
