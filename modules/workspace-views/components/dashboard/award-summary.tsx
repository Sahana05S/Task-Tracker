import { TrophyIcon } from 'lucide-react';

import { awardDayLabel, awardDayView, mondayIndex, type AwardDayKind, type AwardDayView, type AwardReadModel } from '@/modules/scoring/client';
import { AWARD_KIND, AWARD_KIND_ORDER, RECALCULATING } from '@/modules/scoring/components/award-day-kind';
import { InitialsAvatar } from '@/shared/ui/mission-ui';
import { cn, getInitials } from '@/shared/utils';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

/** Who leads the monthly star on daily stars so far (an undecided month never reads "not available"). */
function leaderText(counts: Record<string, number>, names: Record<string, string>): string {
  const top = Math.max(0, ...Object.values(counts));
  if (top === 0) return 'decided at month end';
  const leaders = Object.keys(counts).filter((id) => counts[id] === top).map((id) => names[id] ?? 'Team member');
  return `${leaders.join(' and ')} leading with ${top} daily ${top === 1 ? 'star' : 'stars'}`;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * The month's daily stars at a glance: a Monday-first calendar with the
 * winner's initials on starred days, H on team holidays and a status icon on
 * the rest, beside a tally of each member's starred days and the monthly
 * award. Counts come
 * from the award read model and monthly selection: a day is decided only
 * when it is certified and the monthly selection does not list it as missing.
 * A day being rechecked after a change keeps showing its last decided result
 * with the Recalculating mark (a corner dot), and is counted as rechecked, not
 * decided. The tally counts the days the calendar shows as starred.
 */
export function AwardSummary({awards,names,availabilityReason,holidays,holidayNames={}}:{
  awards: AwardReadModel;
  names: Record<string, string>;
  availabilityReason?: string;
  holidays?: ReadonlySet<string> | null;
  holidayNames?: Record<string, string>;
}) {
  const missing = new Set(awards.monthly.missingDates);
  const byDate = new Map(awards.days.map(day => [day.date, day]));
  const dates = [...new Set([...awards.days.map(day => day.date), ...missing])].sort();
  const decided = (date: string) => {
    const day = byDate.get(date);
    return Boolean(day?.certified && ['completed_winner', 'completed_none'].includes(day.status) && !missing.has(date));
  };
  const required = dates.filter(date => missing.has(date) || decided(date));
  const viewOf = (date: string): AwardDayView => {
    const day = byDate.get(date);
    if (day) return awardDayView(day, holidays);
    return { kind: holidays?.has(date) ? 'holiday' : 'queued', winnerId: null, recalculating: false };
  };
  const views = new Map(dates.map(date => [date, viewOf(date)]));
  const kinds = new Map(dates.map(date => [date, views.get(date)!.kind]));
  const count = (kind: AwardDayKind) => [...kinds.values()].filter(value => value === kind).length;
  const rechecking = dates.filter(date => views.get(date)!.recalculating);

  const stars: Record<string, number> = {};
  for (const { kind, winnerId } of views.values()) if (kind === 'awarded' && winnerId) stars[winnerId] = (stars[winnerId] ?? 0) + 1;
  const nameOf = (id: string) => names[id] ?? 'Team member';
  const tally = Object.entries(stars).sort(([a, x], [b, y]) => y - x || nameOf(a).localeCompare(nameOf(b)));
  const topStars = tally[0]?.[1] ?? 0;

  // Every calendar day from the first to the last award day, so the strip has no holes.
  const calendar: string[] = [];
  if (dates.length) for (let date = dates[0]; date <= dates.at(-1)!; date = addDays(date, 1)) calendar.push(date);
  const lead = calendar.length ? mondayIndex(calendar[0]) : 0;

  const monthly = awards.monthly;
  const winner = monthly.winnerId ? names[monthly.winnerId] ?? 'Team member' : null;
  const monthlyText = monthly.status === 'closed' ? 'month closed; see the archived report'
    : winner ? winner
    : monthly.status === 'complete' ? (monthly.tiedIds.length > 1 ? 'exact tie, no winner' : 'no winner this month')
    : leaderText(monthly.counts, names);

  const describe = (date: string) => {
    const { kind, winnerId, recalculating } = views.get(date)!;
    const mark = recalculating ? ' (last decided result)' : '';
    if (kind === 'awarded') return `${awardDayLabel(date)}: star awarded to ${names[winnerId ?? ''] ?? 'a team member'}${mark}`;
    if (kind === 'holiday') return `${awardDayLabel(date)}: ${holidayNames[date] ?? 'team holiday'}`;
    return `${awardDayLabel(date)}: ${AWARD_KIND[kind].label.toLowerCase()}${mark}`;
  };

  return (
    <section className="soft-card grid gap-3 p-5 sm:p-6" aria-label="Awards">
      <h2 className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight">
        <TrophyIcon className="text-recognition size-5 shrink-0" aria-hidden="true" />
        Awards
      </h2>
      <p className="text-sm">
        {required.length === 0
          ? 'No daily stars are due yet this month.'
          : <>Daily stars: <span className="tabular font-semibold">{required.filter(decided).length} of {required.length}</span> days decided{rechecking.length ? <>, <span className="tabular font-semibold">{rechecking.length}</span> being rechecked</> : null}.</>}
      </p>

      <div className={cn('grid gap-5', calendar.length && 'md:grid-cols-[auto_1fr] md:gap-8')}>
        {calendar.length ? (
          <div className="grid content-start gap-3">
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
                const { winnerId, recalculating } = views.get(date)!;
                const label = describe(date);
                return (
                  <span
                    key={date}
                    role="listitem"
                    title={label}
                    className={cn('relative flex size-8 flex-col items-center justify-center rounded-md border', meta.tone)}
                  >
                    <span aria-hidden="true" className="absolute top-0.5 left-1 text-[0.5625rem] leading-none font-medium opacity-80">{Number(date.slice(8))}</span>
                    {recalculating ? <span aria-hidden="true" className="absolute top-1 right-1 size-1.5 rounded-full bg-current" /> : null}
                    {kind === 'awarded' && winnerId ? (
                      <span aria-hidden="true" className="mt-1 text-[0.6875rem] font-bold">{getInitials(names[winnerId] ?? '?')}</span>
                    ) : kind === 'holiday' ? (
                      <span aria-hidden="true" className="mt-1 text-[0.6875rem] font-bold">H</span>
                    ) : (
                      <Icon aria-hidden="true" className="mt-1 size-3.5" />
                    )}
                    <span className="sr-only">{label}</span>
                  </span>
                );
              })}
            </div>

            <ul className="text-muted-foreground flex max-w-64 flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Key">
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
              {rechecking.length ? (
                <li className="inline-flex items-center gap-1" title={RECALCULATING.description}>
                  <span aria-hidden="true" className="border-border relative inline-flex size-4 rounded border"><span className="absolute top-0.5 right-0.5 size-1 rounded-full bg-current" /></span>
                  {RECALCULATING.label} ({rechecking.length})
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        <div className={cn('grid content-start gap-3', calendar.length && 'md:border-border md:border-l md:pl-8')}>
          <div>
            <h3 className="text-foreground text-sm font-semibold">Stars this month</h3>
            <p className="text-muted-foreground text-xs">Monthly award: <span className="text-foreground font-medium">{monthlyText}</span></p>
          </div>
          {tally.length ? (
            <ol className="grid gap-2.5" aria-label="Daily stars by member">
              {tally.map(([id, starCount]) => (
                <li key={id} className="flex items-center gap-3">
                  <InitialsAvatar name={nameOf(id)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="text-foreground truncate font-medium">{nameOf(id)}</span>
                      <span className="tabular shrink-0 font-semibold">{starCount} {starCount === 1 ? 'star' : 'stars'}</span>
                    </div>
                    <div aria-hidden="true" className="bg-recognition-subtle mt-1 h-1.5 overflow-hidden rounded-full">
                      <div className="bg-recognition h-full rounded-full" style={{ width: `${(starCount / topStars) * 100}%` }} />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground text-sm">No stars awarded yet this month.</p>
          )}
        </div>
      </div>
    </section>
  );
}
