import { CrownIcon, HelpCircleIcon, MedalIcon, StarIcon } from 'lucide-react';

import { BOARD_LABELS, type CategoryAward, type MonthlyStarAct } from '@/modules/recognition/client';
import { displayPerformance } from '@/shared/math/exact';
import { InitialsAvatar } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';

import { ConfettiBurst } from './confetti-burst';

function nameList(ids: readonly string[], names: Record<string, string>): string {
  const list = ids.map((id) => names[id] ?? 'a team member');
  return list.length <= 2 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
}

/** What a category card says, in one line, for the live region and the card. */
export function categorySentence(award: CategoryAward, names: Record<string, string>): string {
  const label = BOARD_LABELS[award.category];
  switch (award.status) {
    case 'awarded': return `${label}: ${names[award.winnerId!] ?? 'a team member'}`;
    case 'tie': return `${label}: an exact tie between ${nameList(award.tiedIds, names)}, so no award`;
    case 'no_eligible': return `${label}: no eligible member scored above zero`;
    default: return `${label}: not measured this month`;
  }
}

/** A face-down card before its reveal; the text is for nobody until it flips. */
export function HiddenAwardCard({ category }: { category: CategoryAward['category'] }) {
  return (
    <li className="soft-card flex min-h-36 flex-col items-center justify-center gap-2 border-dashed p-3 text-center sm:p-4">
      <HelpCircleIcon className="text-primary/40 size-8" aria-hidden="true" />
      <span className="text-muted-foreground text-sm font-semibold">{BOARD_LABELS[category]}</span>
      <span className="sr-only">Not revealed yet</span>
    </li>
  );
}

/** One category award. Gold only for a winner; ties and gaps stay neutral and say why. */
export function AwardCard({ award, names, viewerId, reveal, note }: {
  award: CategoryAward;
  names: Record<string, string>;
  viewerId: string;
  reveal?: boolean;
  /** Plain-language reason for an unavailable category (worded on the server). */
  note?: string;
}) {
  const won = award.status === 'awarded';
  const winner = won ? names[award.winnerId!] ?? 'Team member' : null;
  const you = won && award.winnerId === viewerId;
  return (
    <li
      className={cn(
        'soft-card relative flex min-h-36 min-w-0 flex-col gap-2 overflow-hidden p-3 sm:p-4',
        won && 'border-recognition/50 bg-linear-180 from-recognition-subtle/60 to-card',
        you && 'ring-primary ring-2',
        reveal && 'anim-pop',
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-bold tracking-[0.06em] uppercase">
        <MedalIcon className={cn('size-4', won ? 'text-recognition' : 'text-muted-foreground')} aria-hidden="true" />
        <span className={won ? 'text-recognition-foreground' : 'text-muted-foreground'}>{BOARD_LABELS[award.category]}</span>
      </span>
      {won ? (
        <div className="flex min-w-0 flex-col items-start gap-2">
          <InitialsAvatar name={winner!} className="ring-recognition ring-offset-card size-10 shrink-0 ring-2 ring-offset-2" />
          <div className="min-w-0">
            <p className="text-foreground leading-snug font-bold break-words">{winner}{you ? <span className="text-primary"> (you)</span> : null}</p>
            {award.winningRaw ? <p className="text-muted-foreground text-xs tabular-nums">{displayPerformance(award.winningRaw)}</p> : null}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          {award.status === 'tie'
            ? `Exact tie between ${nameList(award.tiedIds, names)}, so no award.`
            : award.status === 'no_eligible'
              ? 'No eligible member scored above zero this month.'
              : `Not measured this month${note ? `: ${note.toLowerCase()}` : ''}.`}
        </p>
      )}
    </li>
  );
}

/** The ceremony's last act: the monthly star, worth the most. */
export function FinaleCard({ star, names, viewerId, celebrate, confettiId }: {
  star: MonthlyStarAct;
  names: Record<string, string>;
  viewerId: string;
  /** Official and just revealed: the card glows and, for the winner, confetti falls once. */
  celebrate: boolean;
  confettiId: string;
}) {
  const winner = star.winnerId ? names[star.winnerId] ?? 'Team member' : null;
  const you = star.winnerId === viewerId;
  const wins = star.winnerId ? star.counts[star.winnerId] ?? 0 : 0;
  let line: string;
  if (star.status === 'winner') line = `${wins} daily ${wins === 1 ? 'star' : 'stars'} this month, the most on the team.`;
  else if (star.status === 'no_winner') {
    line = star.reasons.includes('exact_monthly_tie')
      ? `${nameList(star.tiedIds, names)} finished exactly level, so there is no monthly star.`
      : 'No daily stars were awarded this month, so there is no monthly star.';
  } else {
    line = star.reasons.includes('daily_coverage_incomplete')
      ? 'Decided once every day of the month has a decided daily star.'
      : 'Decided at the end of the month.';
  }
  return (
    <section
      aria-label="Monthly star"
      className={cn('soft-card relative overflow-hidden p-6 text-center sm:p-8', celebrate && star.status === 'winner' && 'anim-glow')}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-linear-135 from-primary-subtle via-card to-recognition-subtle opacity-90" />
      {celebrate && you ? <ConfettiBurst id={confettiId} /> : null}
      <div className="relative grid justify-items-center gap-3">
        <span className="bg-recognition-subtle text-recognition-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold tracking-[0.06em] uppercase">
          <StarIcon className="text-recognition size-3.5 fill-current" aria-hidden="true" />
          Monthly star
        </span>
        {winner ? (
          <>
            <CrownIcon className="text-recognition size-8 fill-current" aria-hidden="true" />
            <InitialsAvatar name={winner} className={cn('ring-recognition ring-offset-card size-20 text-2xl ring-4 ring-offset-4', celebrate && 'anim-pop')} />
            <h2 className="text-foreground text-2xl font-black tracking-tight text-balance">
              {you ? 'You are the monthly star' : winner}
            </h2>
          </>
        ) : (
          <h2 className="text-foreground text-xl font-bold tracking-tight">
            {star.status === 'pending' ? 'The monthly star is not decided yet' : 'No monthly star this month'}
          </h2>
        )}
        <p className="text-muted-foreground max-w-md text-sm text-pretty">{line}</p>
      </div>
    </section>
  );
}
