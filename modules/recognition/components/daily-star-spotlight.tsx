import Link from 'next/link';
import { AlertTriangleIcon, ArrowRightIcon, RefreshCwIcon, StarIcon } from 'lucide-react';
import type * as React from 'react';

import type { DailyStarHighlight } from '@/modules/recognition/client';
import { GAP_SENTENCE, dataGaps, plainReason } from '@/modules/reports/client';
import type { Section } from '@/shared/async/settle';
import { InitialsAvatar, MissionNotice } from '@/shared/ui/mission-ui';
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
  return 'The run finished without a winner.';
}

/** Run states the rule names when a slot carries no reasons of its own. */
const RUN_STATE_SENTENCE: Record<string, string> = {
  award_run_failed: 'The award run for that day failed.',
  award_run_stale: 'Records changed after this star was chosen; a director needs to re-check it.',
  award_run_missing: 'No award run was recorded for that day.',
  award_run_uncertified: 'This result is not final yet.',
};

/** Plain wording for a blocked run: the data gaps first, else the run's own reasons. */
function blockedSentences(reasons: readonly string[]): string[] {
  const runState = reasons.map((code) => RUN_STATE_SENTENCE[code]).filter((s): s is string => Boolean(s));
  const codes = reasons.filter((code) => !(code in RUN_STATE_SENTENCE));
  const gaps = dataGaps(codes).map((gap) => GAP_SENTENCE[gap]);
  if (gaps.length || runState.length) return [...gaps, ...runState];
  const plain = [...new Set(codes.map(plainReason))];
  return plain.length ? plain.map((s) => `${s}.`) : ['Required data not available.'];
}

/**
 * The Today hero's daily star card: yesterday's certified daily star (M08),
 * today's cutoff and the link to the viewer's performance. A blocked day is
 * stated as waiting for data with its reasons, never as a zero or a fake win.
 * When the viewer is yesterday's star, the card glows and confetti falls once.
 */
export function DailyStarSpotlight({ highlight, names, profileHref }: {
  highlight: Section<DailyStarHighlight>; names: Record<string, string>; profileHref: string;
}) {
  const h = highlight.status === 'ready' ? highlight.data : null;
  const celebrate = Boolean(h && h.status === 'winner' && h.isViewer);
  const winnerName = h?.winnerId ? names[h.winnerId] ?? 'A team member' : null;

  let title: string;
  let body: string;
  let detail: React.ReactNode = null;
  if (!h) {
    title = 'Daily star status unavailable';
    body = "Award data couldn't be loaded right now. Refresh to try again.";
  } else if (!h.policyApproved) {
    title = 'Daily stars are not active yet';
    body = 'Daily star rules are awaiting approval, so no stars are awarded.';
  } else if (h.status === 'winner') {
    title = h.isViewer ? "You earned yesterday's daily star" : `${winnerName} earned yesterday's daily star`;
    body = h.recalculating
      ? `Records for ${longDate(h.date)} changed after this star was decided; it stays until the next run rechecks the day.`
      : `Highest certified score for ${longDate(h.date)}.`;
  } else if (h.status === 'none') {
    title = 'No daily star was awarded yesterday';
    body = h.recalculating
      ? `Records for ${longDate(h.date)} changed after this was decided; the next run rechecks the day.`
      : `${longDate(h.date)}: ${noStarSentence(h.reasons)}`;
  } else if (h.status === 'blocked') {
    title = "Yesterday's daily star is waiting for data";
    body = `The run for ${longDate(h.date)} has not reached a certified result.`;
    detail = (
      <MissionNotice tone="attention" icon={AlertTriangleIcon} className="mt-3" role="status">
        {blockedSentences(h.reasons).join(' ')}
      </MissionNotice>
    );
  } else {
    title = "Yesterday's daily star hasn't been calculated yet";
    body = `No run has been recorded for ${longDate(h.date)} yet.`;
  }

  return (
    <section className={cn('soft-card relative overflow-hidden p-5 sm:p-6', celebrate && 'anim-glow')} aria-label="Daily star spotlight">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-linear-135 from-tier-diamond-subtle via-primary-subtle to-recognition-subtle opacity-70" />
      {celebrate && h ? <ConfettiBurst id={`${h.winnerId}.${h.date}`} /> : null}
      <div className="relative flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <span className="bg-recognition-subtle text-recognition-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[0.06em] uppercase">
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
          {h?.recalculating ? (
            <p className="text-muted-foreground mt-2 inline-flex items-center gap-1.5 text-xs font-medium">
              <RefreshCwIcon className="size-3.5" aria-hidden="true" />
              Recalculating
            </p>
          ) : null}
          <p className="text-muted-foreground mt-1 text-sm">{body}</p>
          {detail}
          {h?.policyApproved ? (
            <p className="text-foreground mt-2 text-sm font-medium">
              Today&apos;s daily star is decided after {cutoffLabel(h.cutoff)} IST.
            </p>
          ) : null}
          <Link href={profileHref} className="text-primary mt-4 inline-flex items-center gap-1.5 rounded-xl bg-card px-3.5 py-2 text-sm font-semibold shadow-(--shadow-card) hover:bg-card/80">
            View performance
            <ArrowRightIcon className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
        <div aria-hidden="true" className={cn('bg-recognition-subtle hidden size-20 shrink-0 items-center justify-center rounded-2xl sm:flex', celebrate && 'anim-pop')}>
          <StarIcon className={cn('text-recognition size-10', h?.status === 'winner' ? 'fill-current' : 'fill-none')} />
        </div>
      </div>
    </section>
  );
}
