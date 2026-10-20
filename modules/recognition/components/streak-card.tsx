import { FlameIcon } from 'lucide-react';

import type { StreakSummary } from '@/modules/recognition/client';
import type { Section } from '@/shared/async/settle';

import { MilestoneMeter } from './milestone-meter';
import { MilestoneToast } from './milestone-toast';
import { StreakFlame } from './streak-flame';
import { StreakStrip } from './streak-strip';

function longDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

/** Copy is factual and past tense for losses: no countdowns, no nagging. */
function headline(s: StreakSummary): { title: string; body: string } {
  if (s.current === 0 && s.longest === 0) {
    return { title: 'No streak yet', body: 'Be present and log something today to start one.' };
  }
  if (s.current === 0) {
    return {
      title: 'Streak ended',
      body: `${s.brokenOn ? `Ended on ${longDate(s.brokenOn)} (absent, or nothing logged). ` : ''}Longest so far: ${s.longest} ${s.longest === 1 ? 'day' : 'days'}. Today starts a new one.`,
    };
  }
  const best = s.current >= 3 && s.current === s.longest ? ' Your longest yet.' : '';
  if (!s.todayCounted) {
    return { title: `${s.current}-day streak`, body: `Today is not counted yet. Log time or a contribution on a present day to add it.${best}` };
  }
  return { title: `${s.current}-day streak`, body: `Today counted.${best || ` Longest so far: ${s.longest} ${s.longest === 1 ? 'day' : 'days'}.`}` };
}

/**
 * The Today streak tile: flame and count, a factual line, the last two weeks
 * and the distance to the next milestone. Unavailable data says so.
 */
export function StreakCard({ streak }: { streak: Section<StreakSummary> }) {
  return (
    <section className="soft-card p-5 sm:p-6" aria-label="Your streak">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight">
          <FlameIcon className="text-streak size-5" aria-hidden="true" />
          Streak
        </h2>
        <span className="text-muted-foreground text-xs">Present + logged, day after day</span>
      </div>
      {streak.status === 'unavailable' ? (
        <p role="alert" className="border-danger-border bg-danger-subtle text-danger-foreground rounded-xl border px-4 py-3 text-sm">
          Your streak couldn&apos;t be loaded right now. Refresh to try again.
        </p>
      ) : (
        <StreakBody streak={streak.data} />
      )}
    </section>
  );
}

function StreakBody({ streak }: { streak: StreakSummary }) {
  const { title, body } = headline(streak);
  const lit = streak.current > 0;
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-4">
        <StreakFlame count={streak.current} lit={lit} />
        <div className="min-w-0">
          <p className="text-foreground text-xl font-bold tracking-tight">{title}</p>
          <p className="text-muted-foreground mt-0.5 text-sm">{body}</p>
        </div>
      </div>
      <StreakStrip days={streak.recentDays} />
      <MilestoneMeter current={streak.current} nextMilestone={streak.nextMilestone} daysToMilestone={streak.daysToMilestone} reached={streak.reached} />
      <p className="text-muted-foreground text-xs">
        Holidays, leave, off hours and days without an attendance record are skipped. An absent day, or a present day with nothing logged, ends the streak.
      </p>
      <MilestoneToast userId={streak.userId} current={streak.current} todayCounted={streak.todayCounted} lastActiveDate={streak.lastActiveDate} milestones={streak.milestones} />
    </div>
  );
}
