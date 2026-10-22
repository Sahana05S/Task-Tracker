import { AwardIcon, CrownIcon, FlameIcon, GemIcon, MedalIcon, StarIcon, TrophyIcon, type LucideIcon } from 'lucide-react';

import { BOARD_LABELS, type HallEntry, type StreakSummary, type HallOfFameModel, type Tier, type TierKey, type TierProgress } from '@/modules/recognition/client';
import { FACTORS } from '@/modules/scoring/client';
import { EmptyState, InitialsAvatar } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';

const TIER_STYLE: Record<TierKey, { ring: string; chip: string; icon: LucideIcon }> = {
  rookie: { ring: 'stroke-primary', chip: 'bg-primary-subtle text-primary-subtle-foreground', icon: StarIcon },
  bronze: { ring: 'stroke-tier-bronze', chip: 'bg-tier-bronze-subtle text-tier-bronze', icon: MedalIcon },
  silver: { ring: 'stroke-tier-silver', chip: 'bg-tier-silver-subtle text-secondary-foreground', icon: MedalIcon },
  gold: { ring: 'stroke-tier-gold', chip: 'bg-tier-gold-subtle text-recognition-foreground', icon: TrophyIcon },
  diamond: { ring: 'stroke-tier-diamond', chip: 'bg-tier-diamond-subtle text-foreground', icon: GemIcon },
};

/** `3 days`, `1 day`. */
export function plural(n: number, word: string): string {
  return `${n} ${n === 1 ? word : `${word}s`}`;
}

export function TierBadge({ tier, className }: { tier: Tier; className?: string }) {
  const style = TIER_STYLE[tier.key];
  const Icon = style.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold', style.chip, className)}>
      <Icon className="size-3" aria-hidden="true" />
      {tier.label}
    </span>
  );
}

/** The viewer's points with a ring showing progress to the next tier. */
export function PointsRing({ points, progress }: { points: number; progress: TierProgress }) {
  const r = 52, c = 2 * Math.PI * r;
  const label = progress.next ? `${progress.percent}% of the way from ${progress.tier.label} to ${progress.next.label}` : `${progress.tier.label}, the top tier`;
  return (
    <div className="relative size-36 shrink-0" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-progress-track" />
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" strokeLinecap="round" className={TIER_STYLE[progress.tier.key].ring}
          strokeDasharray={c} strokeDashoffset={c * (1 - progress.percent / 100)} />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="text-foreground text-3xl font-black tabular-nums">{points}</span>
        <span className="text-muted-foreground text-xs font-medium">points</span>
      </div>
    </div>
  );
}

/** One badge in the trophy case; unearned ones stay grey with what earns them. */
function Badge({ icon: Icon, title, detail, earned, tone }: { icon: LucideIcon; title: string; detail: string; earned: boolean; tone: string }) {
  return (
    <li className={cn('flex min-w-0 items-center gap-3 rounded-xl border p-3', earned ? 'bg-white' : 'bg-muted/60 border-dashed')}>
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', earned ? tone : 'bg-muted text-muted-foreground/60')}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className={cn('block text-sm font-semibold', earned ? 'text-foreground' : 'text-muted-foreground')}>{title}</span>
        <span className="text-muted-foreground block text-xs">{detail}</span>
      </span>
      <span className="sr-only">{earned ? 'Earned' : 'Not earned yet'}</span>
    </li>
  );
}

/** The viewer's trophies: stars, the monthly star and one badge per category. */
export function TrophyCase({ entry, streak }: { entry: HallEntry; streak: Pick<StreakSummary, 'longest' | 'milestones'> | null }) {
  const milestone = streak ? [...streak.milestones].reverse().find((m) => streak.longest >= m) ?? null : null;
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <Badge icon={CrownIcon} title="Monthly star" earned={entry.monthlyStars > 0} tone="bg-recognition-subtle text-recognition"
        detail={entry.monthlyStars ? plural(entry.monthlyStars, 'month') : 'Most daily stars in a month'} />
      <Badge icon={StarIcon} title="Daily star" earned={entry.dailyStars > 0} tone="bg-recognition-subtle text-recognition"
        detail={entry.dailyStars ? plural(entry.dailyStars, 'day') : 'Top certified score of a day'} />
      {streak ? (
        <Badge icon={FlameIcon} title={milestone ? `${milestone}-day streak` : 'Streak'} earned={milestone !== null} tone="bg-streak-subtle text-streak"
          detail={`Longest streak ${plural(streak.longest, 'day')}`} />
      ) : null}
      {FACTORS.map((f) => {
        const n = entry.categories[f] ?? 0;
        return (
          <Badge key={f} icon={AwardIcon} title={`${BOARD_LABELS[f]} award`} earned={n > 0} tone="bg-primary-subtle text-primary"
            detail={n ? plural(n, 'month') : 'Best in the month'} />
        );
      })}
    </ul>
  );
}

/** Everyone in the company by recognition points. */
export function HallOfFameList({ model, viewerId }: { model: HallOfFameModel; viewerId: string }) {
  if (!model.entries.some((e) => e.points > 0)) {
    return <EmptyState icon={TrophyIcon} title="No trophies yet">Daily stars, category awards and monthly stars appear here as they are awarded.</EmptyState>;
  }
  return (
    <ol className="soft-card soft-card-clip">
      {model.entries.map((e) => (
        <li key={e.userId} aria-current={e.userId === viewerId ? 'true' : undefined}
          className={cn('flex items-center gap-3 border-b px-4 py-3 last:border-b-0 sm:px-5', e.userId === viewerId && 'bg-primary-subtle/60')}>
          <span className="text-foreground w-8 text-base font-bold tabular-nums"><span className="sr-only">Place </span>{e.rank}</span>
          <InitialsAvatar name={e.name} className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="text-foreground block truncate text-sm font-medium">{e.name}{e.userId === viewerId ? <span className="text-primary"> (you)</span> : null}</span>
            <span className="text-muted-foreground block text-xs">
              {e.dailyStars} daily · {e.categoryAwards} category · {e.monthlyStars} monthly
            </span>
          </span>
          <TierBadge tier={e.tier} className="hidden sm:inline-flex" />
          <span className="w-16 text-right text-sm font-bold tabular-nums">{e.points}<span className="sr-only"> points</span></span>
        </li>
      ))}
    </ol>
  );
}
