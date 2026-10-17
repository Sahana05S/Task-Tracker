import type { AwardReadModel } from '@/lib/stars/read-model';
import { GAP_SENTENCE, dataGaps } from '@/lib/presentation/plain-language';
import { TrophyIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

type DayState = 'winner' | 'none' | 'blocked' | 'pending';
const DAY_STYLE: Record<DayState, string> = {
  winner: 'bg-recognition border-recognition',
  none: 'bg-white border-[#c9c4e3]',
  blocked: 'bg-attention-border border-[#f5c58a]',
  pending: 'bg-muted border-[#d9d5ec] border-dashed',
};
const DAY_LABEL: Record<DayState, string> = {
  winner: 'daily star decided',
  none: 'decided, no winner',
  blocked: 'waiting for data',
  pending: 'not yet calculated',
};

/**
 * Readable award coverage for the dashboard. Counts come from the same read
 * model and monthly selection as the detailed award table (kept in details):
 * a day is decided only when the monthly selection does not list it as missing.
 */
export function AwardSummary({awards,names,availabilityReason}:{
  awards: AwardReadModel;
  names: Record<string, string>;
  availabilityReason?: string;
}) {
  const missing = new Set(awards.monthly.missingDates);
  const decided = awards.days.filter(d => d.certified && ['completed_winner', 'completed_none'].includes(d.status) && !missing.has(d.date));
  const required = [...new Set([...missing, ...decided.map(d => d.date)])].sort();
  const state = (date: string): DayState => {
    const day = awards.days.find(d => d.date === date);
    if (!missing.has(date) && day?.status === 'completed_winner') return 'winner';
    if (!missing.has(date)) return 'none';
    return day ? 'blocked' : 'pending';
  };
  const monthly = awards.monthly;
  const winner = monthly.winnerId ? names[monthly.winnerId] ?? 'Unknown member' : null;
  const monthlyText = monthly.status === 'closed' ? 'month closed; see the archived report'
    : winner ? winner
    : monthly.status === 'complete' ? (monthly.tiedIds.length > 1 ? 'exact tie, no winner' : 'no winner this month')
    : monthly.status === 'provisional' ? 'provisional while the month is in progress'
    : 'not available yet';
  const gaps = dataGaps([...monthly.reasons, ...awards.days.flatMap(d => d.reasons ?? [])]);
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
          : <>Daily stars: <span className="tabular font-semibold">{required.length - missing.size} of {required.length}</span> days decided.</>}
      </p>
      {required.length ? (
        <ol className="flex flex-wrap gap-1" aria-label="Daily star coverage">
          {required.map(date => {
            const s = state(date);
            return (
              <li key={date} title={`${date}: ${DAY_LABEL[s]}`} className={cn('size-4 rounded-[5px] border', DAY_STYLE[s])}>
                <span className="sr-only">{date}: {DAY_LABEL[s]}</span>
              </li>
            );
          })}
        </ol>
      ) : null}
      {required.length ? (
        <p className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {(['winner', 'none', 'blocked', 'pending'] as const).map(s => (
            <span key={s} className="inline-flex items-center gap-1"><span className={cn('inline-block size-2.5 rounded-sm border', DAY_STYLE[s])} />{DAY_LABEL[s]}</span>
          ))}
        </p>
      ) : null}
      {missing.size && gaps.length ? <p className="text-sm">Undecided days are waiting for data. {gaps.map(g => GAP_SENTENCE[g]).join(' ')}</p> : null}
      {availabilityReason ? <p role="status" className="text-sm">{availabilityReason}</p> : null}
    </section>
  );
}
