import type { Metadata } from 'next';
import { DatabaseIcon, TriangleAlertIcon, TrophyIcon } from 'lucide-react';

import { HallOfFameList, plural, PointsRing, TierBadge, TrophyCase } from '@/modules/recognition/components/hall-cards';
import { BOARD_LABELS, getHallOfFame, getStreak } from '@/modules/recognition';
import { getCommendationTotals } from '@/modules/policies';
import { settle } from '@/shared/async/settle';
import { requireProfile } from '@/shared/session/profile';
import { formatDate } from '@/shared/tracker/format';
import { MissionNotice, MissionPage, MissionPageHeader, MissionPanel } from '@/shared/ui/mission-ui';

export const metadata: Metadata = { title: 'Hall of fame · TaskPulse' };

const KIND_LABEL = { dailyStar: 'Daily star', categoryAward: 'Category award', monthlyStar: 'Monthly star' } as const;
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * All-time recognition: points from daily stars (10), category awards (25)
 * and monthly stars (100), the viewer's tier and trophy case, and everyone in
 * the company by points. Points are recognition only; they never feed a score.
 */
export default async function HallOfFamePage() {
  const profile = await requireProfile();
  // Commendation points are optional: without migration 56 the hall shows award points only.
  const policyPoints = getCommendationTotals().catch(() => ({}));
  const [read, streak] = await Promise.all([settle(() => getHallOfFame(profile.id, policyPoints)), settle(() => getStreak(profile.id))]);
  const hall = read.status === 'ready' ? read.data : null;
  const unavailable = read.status !== 'ready' ? 'error' : hall === null ? 'migration' : null;
  const me = hall?.viewer ?? null;

  return (
    <MissionPage>
      <MissionPageHeader
        eyebrow="Team · Hall of fame"
        title="Hall of fame"
        chip={me ? `${me.points} points` : undefined}
        description={hall
          ? `All time · daily star ${hall.policy.dailyStar}, category award ${hall.policy.categoryAward}, monthly star ${hall.policy.monthlyStar} points, plus each policy's commendation points · recognition only, never part of a score`
          : 'All-time recognition points'}
      />

      {unavailable === 'migration' ? (
        <MissionNotice tone="attention" icon={DatabaseIcon} role="status">
          The hall of fame needs a database update that this workspace doesn&apos;t have yet. Daily stars still show on Today and the dashboard.
        </MissionNotice>
      ) : unavailable === 'error' ? (
        <MissionNotice tone="danger" icon={TriangleAlertIcon} role="status">The hall of fame couldn&apos;t be loaded right now. Refresh to try again.</MissionNotice>
      ) : null}

      {hall && me ? (
        <section className="soft-card grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:items-center sm:p-6" aria-label="Your points">
          <PointsRing points={me.points} progress={me.progress} />
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-foreground text-xl font-bold tracking-tight">Your tier</h2>
              <TierBadge tier={me.progress.tier} />
            </div>
            <p className="text-muted-foreground text-sm">
              {me.progress.next
                ? `${plural(me.progress.toNext, 'point')} more to ${me.progress.next.label}.`
                : 'You have reached the top tier.'}
              {me.points > 0 ? ` Place ${me.rank} of ${hall.entries.length} in the company.` : ' Trophies appear here as you earn them.'}
            </p>
            <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <div><dt className="text-muted-foreground inline">Daily stars </dt><dd className="text-foreground inline font-semibold tabular-nums">{me.dailyStars}</dd></div>
              <div><dt className="text-muted-foreground inline">Category awards </dt><dd className="text-foreground inline font-semibold tabular-nums">{me.categoryAwards}</dd></div>
              <div><dt className="text-muted-foreground inline">Monthly stars </dt><dd className="text-foreground inline font-semibold tabular-nums">{me.monthlyStars}</dd></div>
              <div><dt className="text-muted-foreground inline">Commendations </dt><dd className="text-foreground inline font-semibold tabular-nums">{me.commendations}</dd></div>
            </dl>
          </div>
        </section>
      ) : null}

      {hall && me ? (
        <MissionPanel icon={TrophyIcon} title="Trophy case" subtitle="Earned badges are in colour; the rest say what earns them.">
          <TrophyCase entry={me} streak={streak.status === 'ready' ? streak.data : null} />
          {hall.recent.length ? (
            <div className="mt-5">
              <h3 className="text-foreground mb-2 text-sm font-semibold">Latest trophies</h3>
              <ul className="grid gap-1 text-sm">
                {hall.recent.map((r) => (
                  <li key={`${r.kind}-${r.date}-${r.category ?? ''}`} className="flex flex-wrap gap-x-2">
                    <span className="text-foreground font-medium">{r.category ? `${BOARD_LABELS[r.category]} award` : KIND_LABEL[r.kind]}</span>
                    <span className="text-muted-foreground">{r.kind === 'dailyStar' ? formatDate(r.date) : MONTH.format(new Date(`${r.date}T00:00:00Z`))}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </MissionPanel>
      ) : null}

      {hall ? (
        <section aria-label="Everyone">
          <h2 className="text-foreground mb-3 text-lg font-bold tracking-tight">Everyone</h2>
          <HallOfFameList model={hall} viewerId={profile.id} />
        </section>
      ) : null}
    </MissionPage>
  );
}
