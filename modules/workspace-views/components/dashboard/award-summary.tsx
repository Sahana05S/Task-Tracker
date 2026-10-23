import Link from 'next/link';
import { ArrowRightIcon, TrophyIcon } from 'lucide-react';

import { awardDayKind, awardDayLabel, mondayIndex, type AwardDayKind, type AwardReadModel } from '@/modules/scoring/client';
import { AWARD_KIND, AWARD_KIND_ORDER } from '@/modules/scoring/components/award-day-kind';
import { GAP_SENTENCE, dataGaps } from '@/modules/reports/client';
import { cn, getInitials } from '@/shared/utils';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * The month's daily stars at a glance: a Monday-first calendar strip with the
 * winner's initials on starred days, H on team holidays and a status icon on
 * the rest, then one plain sentence on why days are still open. The
 * day-by-day calculation behind it lives in the dashboard's calculation
 * details (`detailsHref`). Counts come from the same read model and monthly
 * selection: a day is decided only when the monthly selection does not list
 * it as missing.
 */
export function AwardSummary({awards,names,availabilityReason,holidays,holidayNames={},detailsHref}:{
  awards: AwardReadModel;
  names: Record<string, string>;
  availabilityReason?: string;
  holidays?: ReadonlySet<string> | null;
  holidayNames?: Record<string, string>;
  detailsHref?: string;
}) {
  const missing = new Set(awards.monthly.missingDates);
  const byDate = new Map(awards.days.map(day => [day.date, day]));
  const dates = [...new Set([...awards.days.map(day => day.date), ...missing])].sort();
  const decided = (date: string) => {
    const day = byDate.get(date);
    return Boolean(day?.certified && ['completed_winner', 'completed_none'].includes(day.status) && !missing.has(date));
  };
  const required = dates.filter(date => missing.has(date) || decided(date));
  const kindOf = (date: string): AwardDayKind => {
    const day = byDate.get(date);
    if (day) return awardDayKind(day, holidays);
    return holidays?.has(date) ? 'holiday' : 'queued';
  };
  const kinds = new Map(dates.map(date => [date, kindOf(date)]));
  const count = (kind: AwardDayKind) => [...kinds.values()].filter(value => value === kind).length;

  // Every calendar day from the first to the last award day, so the strip has no holes.
  const calendar: string[] = [];
  if (dates.length) for (let date = dates[0]; date <= dates.at(-1)!; date = addDays(date, 1)) calendar.push(date);
  const lead = calendar.length ? mondayIndex(calendar[0]) : 0;

  const monthly = awards.monthly;
  const winner = monthly.winnerId ? names[monthly.winnerId] ?? 'Team member' : null;
  const monthlyText = monthly.status === 'closed' ? 'month closed; see the archived report'
    : winner ? winner
    : monthly.status === 'complete' ? (monthly.tiedIds.length > 1 ? 'exact tie, no winner' : 'no winner this month')
    : monthly.status === 'provisional' ? 'provisional while the month is in progress'
    : 'not available yet';

  const waiting = dates.filter(date => kinds.get(date) === 'waiting');
  const gaps = dataGaps(waiting.flatMap(date => byDate.get(date)?.reasons ?? []));
  const queued = count('queued');
  const failed = count('failed');
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const explanation = [
    waiting.length ? `${plural(waiting.length, 'day')} waiting for data. ${gaps.length ? gaps.map(gap => GAP_SENTENCE[gap]).join(' ') : GAP_SENTENCE.other}` : '',
    failed ? `${plural(failed, 'day')} failed to calculate and will be retried.` : '',
    queued ? `${plural(queued, 'day')} will be calculated in the next nightly run.` : '',
  ].filter(Boolean).join(' ');

  const describe = (date: string) => {
    const kind = kinds.get(date)!;
    const day = byDate.get(date);
    if (kind === 'awarded') return `${awardDayLabel(date)}: star awarded to ${names[day?.winnerId ?? ''] ?? 'a team member'}`;
    if (kind === 'holiday') return `${awardDayLabel(date)}: ${holidayNames[date] ?? 'team holiday'}`;
    return `${awardDayLabel(date)}: ${AWARD_KIND[kind].label.toLowerCase()}`;
  };

  return (
    <section className="soft-card grid gap-3 p-5 sm:p-6" aria-label="Awards">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight">
          <TrophyIcon className="text-recognition size-5 shrink-0" aria-hidden="true" />
          Awards
        </h2>
        <p className="text-muted-foreground text-xs">Monthly award: <span className="text-foreground font-medium">{monthlyText}</span></p>
      </div>
      <p className="text-sm">
        {required.length === 0
          ? 'No daily stars are due yet this month.'
          : <>Daily stars: <span className="tabular font-semibold">{required.filter(decided).length} of {required.length}</span> days decided.</>}
      </p>

      {calendar.length ? (
        <div className="grid w-max grid-cols-7 gap-1" role="list" aria-label="Daily stars this month">
          {WEEKDAYS.map((weekday, index) => (
            <span key={index} aria-hidden="true" className="text-muted-foreground text-center text-[0.625rem] font-semibold">{weekday}</span>
          ))}
          {Array.from({ length: lead }, (_, index) => <span key={`lead-${index}`} aria-hidden="true" />)}
          {calendar.map(date => {
            const kind = kinds.get(date);
            if (!kind) return <span key={date} aria-hidden="true" />;
            const meta = AWARD_KIND[kind];
            const Icon = meta.icon;
            const winnerId = byDate.get(date)?.winnerId;
            const label = describe(date);
            return (
              <span
                key={date}
                role="listitem"
                title={label}
                className={cn('relative flex size-9 flex-col items-center justify-center rounded-lg border sm:size-10', meta.tone)}
              >
                <span aria-hidden="true" className="absolute top-0.5 left-1 text-[0.5625rem] leading-none font-medium opacity-80">{Number(date.slice(8))}</span>
                {kind === 'awarded' && winnerId ? (
                  <span aria-hidden="true" className="mt-1.5 text-[0.6875rem] font-bold">{getInitials(names[winnerId] ?? '?')}</span>
                ) : kind === 'holiday' ? (
                  <span aria-hidden="true" className="mt-1.5 text-[0.6875rem] font-bold">H</span>
                ) : (
                  <Icon aria-hidden="true" className="mt-1.5 size-3.5" />
                )}
                <span className="sr-only">{label}</span>
              </span>
            );
          })}
        </div>
      ) : null}

      {calendar.length ? (
        <ul className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Key">
          {AWARD_KIND_ORDER.filter(kind => count(kind)).map(kind => {
            const meta = AWARD_KIND[kind];
            const Icon = meta.icon;
            return (
              <li key={kind} className="inline-flex items-center gap-1">
                <span className={cn('inline-flex size-4 items-center justify-center rounded border', meta.tone)}>
                  {kind === 'holiday' ? <span className="text-[0.5rem] font-bold">H</span> : <Icon aria-hidden="true" className="size-2.5" />}
                </span>
                {kind === 'awarded' ? 'Star awarded, winner\'s initials' : meta.label} ({count(kind)})
              </li>
            );
          })}
        </ul>
      ) : null}

      {explanation ? <p className="text-sm">{explanation}</p> : null}
      {availabilityReason ? <p role="status" className="text-sm">{availabilityReason}</p> : null}
      {detailsHref && dates.length ? (
        <Link href={detailsHref} className="text-primary inline-flex items-center gap-1 justify-self-start text-sm font-medium hover:underline">
          See the day-by-day calculation
          <ArrowRightIcon className="size-3.5" aria-hidden="true" />
        </Link>
      ) : null}
    </section>
  );
}
