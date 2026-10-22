import type { Metadata } from 'next';
import { TriangleAlertIcon } from 'lucide-react';

import { LeaderboardBoardStatus, LeaderboardList } from '@/modules/recognition/components/leaderboard-list';
import { LeaderboardPodium } from '@/modules/recognition/components/leaderboard-podium';
import { LeaderboardTabs } from '@/modules/recognition/components/leaderboard-tabs';
import { BOARD_LABELS, BOARD_SUMMARIES, getLeaderboard, leaderboardPeriod, parseBoardKey } from '@/modules/recognition';
import { settle } from '@/shared/async/settle';
import { requireProfile } from '@/shared/session/profile';
import { formatDateTime } from '@/shared/tracker/format';
import { buttonVariants } from '@/shared/ui/button';
import { MissionNotice, MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';
import { currentPeriod } from '@/shared/time/period';

export const metadata: Metadata = { title: 'Leaderboard · TaskPulse' };

/**
 * The month's leaderboard: the shared ten-factor score and each factor, ranked.
 * Everyone sees every rank and the overall score; factor values stay with the
 * member and managers. It adds no scoring rule and never feeds one.
 */
export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ month?: string; factor?: string }> }) {
  const profile = await requireProfile();
  const query = await searchParams;
  const key = parseBoardKey(query.factor);
  let period = currentPeriod();
  let monthError: string | null = null;
  try {
    period = leaderboardPeriod(query.month);
  } catch (error) {
    monthError = error instanceof Error ? error.message : 'Choose a valid month.';
  }
  const month = period.startDate.slice(0, 7);
  const model = await settle(() => getLeaderboard(profile, period));
  const names = model.status === 'ready' ? model.data.names : {};
  const board = model.status === 'ready' ? model.data.boards[key] : null;
  const you = board?.rows.find((row) => row.userId === profile.id);

  return (
    <MissionPage>
      <MissionPageHeader
        eyebrow="Team · Leaderboard"
        title="Leaderboard"
        chip={board?.rows.length ? `${board.rows.length} ranked` : undefined}
        description={
          model.status === 'ready'
            ? `${period.label} · as of ${formatDateTime(model.data.asOf)} · exact ties share a place`
            : period.label
        }
        actions={
          <form method="get" className="flex items-center gap-2">
            {key !== 'composite' ? <input type="hidden" name="factor" value={key} /> : null}
            <label htmlFor="leaderboard-month" className="sr-only">Month</label>
            <input id="leaderboard-month" type="month" name="month" autoComplete="off" defaultValue={month} max={currentPeriod().startDate.slice(0, 7)} className="field h-10 w-48 bg-card" />
            <button type="submit" className={buttonVariants({ variant: 'outline' })}>View</button>
          </form>
        }
        tabs={model.status === 'ready' ? <LeaderboardTabs boards={model.data.boards} active={key} month={month} /> : null}
      />

      {monthError ? (
        <MissionNotice tone="attention" icon={TriangleAlertIcon} role="status">{monthError} Showing {period.label}.</MissionNotice>
      ) : null}

      {model.status !== 'ready' || !board ? (
        <MissionNotice tone="danger" icon={TriangleAlertIcon} role="status">
          The leaderboard couldn&apos;t be calculated right now. Refresh to try again.
        </MissionNotice>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <h2 className="text-foreground text-lg font-bold tracking-tight">{BOARD_LABELS[key]}</h2>
              <p className="text-muted-foreground text-sm">{BOARD_SUMMARIES[key]}</p>
            </div>
            {board.status === 'ready' ? (
              <p className="text-foreground text-sm font-medium">
                {you ? `You're in place ${you.rank} of ${board.rows.length}.` : 'You are not ranked on this board this month.'}
              </p>
            ) : null}
          </div>
          <LeaderboardBoardStatus board={board} />
          <LeaderboardPodium rows={board.rows} names={names} viewerId={profile.id} />
          <LeaderboardList board={board} names={names} viewerId={profile.id} />
          {key !== 'composite' && board.rows.some((row) => row.value === null) ? (
            <p className="text-muted-foreground text-xs">Factor values are shown to each member and to managers; everyone sees the places.</p>
          ) : null}
        </>
      )}
    </MissionPage>
  );
}
