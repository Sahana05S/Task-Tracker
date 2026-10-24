import type { Metadata } from 'next';
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { FirstRunCard } from '@/modules/workspace-views/components/today/first-run-card';
import { FIRST_RUN_COOKIE } from '@/modules/workspace-views/components/today/first-run';
import { MissionRoadmap } from '@/modules/workspace-views/components/today/mission-roadmap';
import { getAssignedMissionBatch } from '@/modules/tasks';
import { missionDueFilter } from '@/modules/tasks/client';
import { kolkataDate } from '@/shared/time/kolkata';
import { parseRoadmapLocation, roadmapLayout } from '@/modules/workspace-views/client';

import {
  AnalyticsTeaser,
  RecognisedContributions,
  StarCalendar,
  WeekSummaryCard,
} from '@/modules/workspace-views/components/today/today-sections';
import { requireProfile } from '@/shared/session/profile';
import { getTodayData, weekStartOf } from '@/modules/workspace-views';
import { getDailyStarHighlight, getStreak, getWaypointCount } from '@/modules/recognition';
import { DailyStarSpotlight } from '@/modules/recognition/components/daily-star-spotlight';
import { StreakCard } from '@/modules/recognition/components/streak-card';
import { settle } from '@/shared/async/settle';
import { MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';
import { CheckInPrompt } from '@/modules/attendance/components/check-in-prompt';

export const metadata: Metadata = { title: 'Today' };

const NEW_MEMBER_MS = 30 * 86_400_000;

/**
 * Personal Today page (layout reference: Stitch today_dashboard_2). Every
 * figure comes from existing data under the caller's permissions; sections show
 * explicit empty or unavailable states. The star content presents existing
 * daily awards and validated contributions; the streak tile and the daily
 * star spotlight are the M16 reads, settled independently so they never delay
 * the rest.
 */
export default async function TodayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireProfile();
  const query = await searchParams;
  const due = missionDueFilter(query.due);
  const today = kolkataDate();
  const initial = await getAssignedMissionBatch(profile.id, { due }).catch(() => null);
  // New in the last 30 days, until dismissed.
  const firstRun = Date.now() - Date.parse(profile.createdAt) < NEW_MEMBER_MS && (await cookies()).get(FIRST_RUN_COOKIE)?.value !== 'dismissed';
  return <MissionPage>
    <MissionPageHeader title="Today" description="A clear path through your work." actions={<Suspense fallback={null}><CheckInPrompt userId={profile.id} /></Suspense>} />
    {firstRun ? <FirstRunCard name={profile.fullName} /> : null}
    <MissionRoadmap key={due} initial={initial} due={due} today={today} initialView={query.view === 'list' ? 'list' : 'roadmap'} initialLocation={parseRoadmapLocation(query)} initialLayout={roadmapLayout(query.layout)} />
    <Suspense fallback={<p role="status" className="text-muted-foreground mt-5 text-sm">Loading your week and team updates…</p>}>
      <TodayOverview profile={profile} />
    </Suspense>
  </MissionPage>;
}

async function TodayOverview({ profile }: { profile: { id: string; employeeId: string } }) {
  const today = kolkataDate();
  const [data, streak, star, waypoints] = await Promise.all([
    getTodayData(profile.id, new Date(), false),
    settle(() => getStreak(profile.id)),
    settle(() => getDailyStarHighlight(profile.id)),
    // The same Monday-to-today week as the card's other rows; null hides the row.
    getWaypointCount(profile.id, weekStartOf(today), today).catch(() => null),
  ]);
  const date = new Date(`${data.today}T00:00:00Z`);
  const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);

  return (
    <div className="border-border mt-5 border-t pt-8">
      <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
        <div className="grid content-start gap-4 lg:col-span-8 lg:gap-6">
          <DailyStarSpotlight highlight={star} names={data.names} profileHref={`/team/${encodeURIComponent(profile.employeeId)}`} />
        </div>
        <div className="grid content-start gap-4 md:grid-cols-2 lg:col-span-4 lg:grid-cols-1 lg:gap-6">
          <StreakCard streak={streak} />
          <WeekSummaryCard week={data.week} waypointsReached={waypoints?.total ?? null} />
          <StarCalendar awards={data.awards} today={data.today} monthStart={data.monthStart} userId={profile.id} />
          <div className="md:col-span-2 lg:col-span-1">
            <RecognisedContributions validated={data.validated} />
          </div>
        </div>
        <div className="lg:col-span-12">
          <AnalyticsTeaser monthLabel={monthLabel} />
        </div>
      </div>
    </div>
  );
}
