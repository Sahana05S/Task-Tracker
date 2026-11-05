import type { Metadata } from 'next';
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { FirstRunCard } from '@/modules/workspace-views/components/today/first-run-card';
import { FIRST_RUN_COOKIE } from '@/modules/workspace-views/components/today/first-run';
import { MissionRoadmap } from '@/modules/workspace-views/components/today/mission-roadmap';
import { getAssignedMissionBatch } from '@/modules/tasks';
import { getLabelsFor } from '@/modules/labels';
import { getMemberNames } from '@/modules/team';
import { missionDueFilter } from '@/modules/tasks/client';
import { kolkataDate } from '@/shared/time/kolkata';
import { parseRoadmapLocation, roadmapScope } from '@/modules/workspace-views/client';

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
import { HrPrompt } from '@/modules/hr/components/hr-prompt';
import { RecordsPrompt } from '@/modules/personnel/components/records-prompt';

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
  // The managing director and project engineers may switch to the whole team's missions.
  // The whole team's graph opens other people's checklists: the managing director only (migration 117).
  const canSeeTeam = profile.role === 'managing_director';
  const scope = canSeeTeam ? roadmapScope(query.scope) : 'mine';
  const initial = await getAssignedMissionBatch(profile.id, { due, scope, watching: true }).catch(() => null);
  // Labels (migration 112) and member names (Quest owners on the map, migration 122); a failure only hides them.
  const [initialLabels, memberNames] = await Promise.all([
    initial ? getLabelsFor('task', initial.missions.map((mission) => mission.id)).catch(() => null) : null,
    getMemberNames().catch(() => null),
  ]);
  // New in the last 30 days, until dismissed.
  const firstRun = Date.now() - Date.parse(profile.createdAt) < NEW_MEMBER_MS && (await cookies()).get(FIRST_RUN_COOKIE)?.value !== 'dismissed';
  return <MissionPage>
    <MissionPageHeader title="Today" description="A clear path through your work." actions={<Suspense fallback={null}><CheckInPrompt userId={profile.id} /></Suspense>} />
    {firstRun ? <FirstRunCard name={profile.fullName} /> : null}
    <Suspense fallback={null}><HrPrompt userId={profile.id} /></Suspense>
    <Suspense fallback={null}><RecordsPrompt userId={profile.id} employeeId={profile.employeeId} /></Suspense>
    <MissionRoadmap key={`${due}:${scope}`} initial={initial} due={due} scope={scope} canSeeTeam={canSeeTeam} today={today} initialView={query.view === 'list' ? 'list' : 'roadmap'} initialLocation={parseRoadmapLocation(query)} initialLabels={initialLabels} memberNames={memberNames} />
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
      {/*
        Rows of equal-height cards, so neither side of the page runs empty while
        scrolling: the daily star beside the streak, then the week, the star
        calendar and recognised contributions in three equal columns, then the
        analytics link across the full width. Each wrapper is a one-cell grid so
        the card inside stretches to the row's height.
      */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-12 lg:gap-6">
        <div className="grid md:col-span-2 lg:col-span-7 xl:col-span-8">
          <DailyStarSpotlight highlight={star} names={data.names} profileHref={`/team/${encodeURIComponent(profile.employeeId)}`} />
        </div>
        <div className="grid md:col-span-2 lg:col-span-5 xl:col-span-4">
          <StreakCard streak={streak} />
        </div>
        <div className="grid lg:col-span-4">
          <WeekSummaryCard week={data.week} waypointsReached={waypoints?.total ?? null} />
        </div>
        <div className="grid lg:col-span-4">
          <StarCalendar awards={data.awards} today={data.today} monthStart={data.monthStart} userId={profile.id} />
        </div>
        <div className="grid md:col-span-2 lg:col-span-4">
          <RecognisedContributions validated={data.validated} />
        </div>
        <div className="md:col-span-2 lg:col-span-12">
          <AnalyticsTeaser monthLabel={monthLabel} />
        </div>
      </div>
    </div>
  );
}
