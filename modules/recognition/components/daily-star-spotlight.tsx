import Link from 'next/link';
import { ArrowRightIcon, StarIcon } from 'lucide-react';

import type { DailyStarHighlight } from '@/modules/recognition/client';
import { plainReason } from '@/modules/reports/client';
import type { Section } from '@/shared/async/settle';
import { AsOfNote } from '@/shared/ui/as-of-note';
import { InitialsAvatar } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';

import { ConfettiBurst } from './confetti-burst';

function longDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

function cutoffLabel(cutoff: DailyStarHighlight['cutoff']): string {
  if (!cutoff) return 'the end of the day';
  const h = cutoff.hour % 12 === 0 ? 12 : cutoff.hour % 12;
  return `${h}:${String(cutoff.minute).padStart(2, '0')} ${cutoff.hour < 12 ? 'am' : 'pm'}`;
}

/** Why a certified run awarded nobody (M08 contract codes). */
const NO_STAR_REASON: Record<string, string> = {
  exact_highest_score_tie: 'The highest scores were an exact tie, so no star was awarded.',
  no_eligible_candidates: 'No one was eligible for the star that day.',
};

function noStarSentence(reasons: readonly string[]): string {
  const known = reasons.map((code) => NO_STAR_REASON[code]).filter((s): s is string => Boolean(s));
  if (known.length) return [...new Set(known)].join(' ');
  if (reasons.length) return `${[...new Set(reasons.map(plainReason))].join('. ')}.`;
  return 'No one won the star that day.';
}

/**
 * The Today hero's daily star card: the latest decided daily star (M08) - yesterday's,
 * or the most recent decided day with an "As of" date - today's cutoff and the link to
 * the viewer's performance. It never shows a "waiting for data" state (user decision,
 * 25 October 2026). When the viewer is the shown star, the card glows and confetti falls once.
 */
export function DailyStarSpotlight({ highlight, names, profileHref }: {
  highlight: Section<DailyStarHighlight>; names: Record<string, string>; profileHref: string;
}) {
  const h = highlight.status === 'ready' ? highlight.data : null;
  const celebrate = Boolean(h && h.status === 'winner' && h.isViewer);
  const winnerName = h?.winnerId ? names[h.winnerId] ?? 'A team member' : null;

  const earlier = Boolean(h?.fromEarlierDay);
  let title: string;
  let body: string;
  if (!h) {
    title = 'Daily star status unavailable';
    body = "Award data couldn't be loaded right now. Refresh to try again.";
  } else if (!h.policyApproved) {
    title = 'Daily stars are not active yet';
    body = 'Daily star rules are awaiting approval, so no stars are awarded.';
  } else if (h.status === 'winner') {
    title = earlier
      ? h.isViewer ? 'You are the latest daily star' : `${winnerName} is the latest daily star`
      : h.isViewer ? "You earned yesterday's daily star" : `${winnerName} earned yesterday's daily star`;
    body = `Highest score on ${longDate(h.date)}.`;
  } else if (h.status === 'none') {
    title = earlier ? `No daily star on ${longDate(h.date)}` : 'No daily star was awarded yesterday';
    body = noStarSentence(h.reasons);
  } else {
    title = 'Daily stars are decided every night';
    body = "The first star appears after tonight's run.";
  }

  return (
    <section className={cn('soft-card relative flex flex-col overflow-hidden p-5 sm:p-6', celebrate && 'anim-glow')} aria-label="Daily star spotlight">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-linear-135 from-tier-diamond-subtle via-primary-subtle to-recognition-subtle opacity-70" />
      {celebrate && h ? <ConfettiBurst id={`${h.winnerId}.${h.date}`} /> : null}
      <div className="relative flex flex-1 items-start gap-4">
        <div className="flex h-full min-w-0 flex-1 flex-col">
          <span className="bg-recognition-subtle text-recognition-foreground inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[0.06em] uppercase">
            <StarIcon className="text-recognition size-3.5 fill-current" aria-hidden="true" />
            Daily star
          </span>
          <div className="mt-3 flex items-center gap-3">
            {h?.status === 'winner' && winnerName ? (
              <InitialsAvatar
                name={winnerName}
               
                className={cn('size-12 text-base ring-[3px] ring-recognition ring-offset-2 ring-offset-card', celebrate && 'anim-pop')}
              />
            ) : null}
            <h2 className="text-foreground min-w-0 text-xl font-bold tracking-tight">{title}</h2>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">{body}</p>
          {h && earlier ? <AsOfNote date={h.date} className="mt-1" /> : null}
          {h?.policyApproved ? (
            <p className="text-foreground mt-2 text-sm font-medium">
              Today&apos;s daily star is decided after {cutoffLabel(h.cutoff)} IST.
            </p>
          ) : null}
          {/* Pinned to the card's foot, so the card reads as one block beside a taller streak card. */}
          <div className="mt-auto pt-4">
            <Link href={profileHref} className="text-primary inline-flex items-center gap-1.5 rounded-xl bg-card px-3.5 py-2 text-sm font-semibold shadow-(--shadow-card) hover:bg-card/80">
              View performance
              <ArrowRightIcon className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
        <div aria-hidden="true" className={cn('bg-recognition-subtle hidden size-20 shrink-0 items-center justify-center rounded-2xl sm:flex', celebrate && 'anim-pop')}>
          <StarIcon className={cn('text-recognition size-10', h?.status === 'winner' ? 'fill-current' : 'fill-none')} />
        </div>
      </div>
    </section>
  );
}
