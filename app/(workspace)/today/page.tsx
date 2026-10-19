import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MissionRoadmap } from '@/modules/workspace-views/components/today/mission-roadmap';
import { getAssignedMissionBatch } from '@/modules/tasks';
import { missionDueFilter } from '@/modules/tasks/client';
import { kolkataDate } from '@/shared/time/kolkata';
import { parseRoadmapLocation } from '@/modules/workspace-views/client';

import {
  AnalyticsTeaser,
  RecognisedContributions,
  StarCalendar,
  StarStatusCard,
  WeekSummaryCard,
} from '@/modules/workspace-views/components/today/today-sections';
import { requireProfile } from '@/shared/session/profile';
import { getTodayData } from '@/modules/workspace-views';
import { getStreak } from '@/modules/recognition';
import { StreakCard } from '@/modules/recognition/components/streak-card';
import { settle } from '@/shared/async/settle';

export const metadata: Metadata = { title: 'Today · TaskPulse' };

/**
 * Personal Today page (layout reference: Stitch today_dashboard_2). Every
 * figure comes from existing data under the caller's permissions; sections show
 * explicit empty or unavailable states. The star content presents existing
 * daily awards and validated contributions; the streak tile is the approved
 * active-day streak (M16), read independently so it never delays the rest.
 */
export default async function TodayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireProfile();
  const query = await searchParams;
  const due = missionDueFilter(query.due);
  const today = kolkataDate();
  const initial = await getAssignedMissionBatch(profile.id, { due }).catch(() => null);
  return <div className="mx-auto w-full max-w-[1200px] px-4 pt-6 pb-10 lg:px-6">
    <header className="mb-6"><h1 className="text-foreground text-3xl font-bold tracking-tight">Today</h1><p className="text-muted-foreground mt-1 text-sm">A clear path through your work.</p></header>
    <MissionRoadmap key={due} initial={initial} due={due} today={today} initialView={query.view === 'list' ? 'list' : 'roadmap'} initialLocation={parseRoadmapLocation(query)} />
    <Suspense fallback={<p role="status" className="text-muted-foreground mt-10 text-sm">Loading your week and team updates…</p>}>
      <TodayOverview profile={profile} />
    </Suspense>
  </div>;
}

async function TodayOverview({ profile }: { profile: { id: string; employeeId: string } }) {
  const [data, streak] = await Promise.all([getTodayData(profile.id, new Date(), false), settle(() => getStreak(profile.id))]);
  const date = new Date(`${data.today}T00:00:00Z`);
  const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);

  return (
    <div className="mt-10 border-t border-border pt-8">
      <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
        <div className="grid content-start gap-4 lg:col-span-8 lg:gap-6">
          <StarStatusCard awards={data.awards} today={data.today} userId={profile.id} names={data.names}
            profileHref={`/team/${encodeURIComponent(profile.employeeId)}`} />
        </div>
        <div className="grid content-start gap-4 md:grid-cols-2 lg:col-span-4 lg:grid-cols-1 lg:gap-6">
          <StreakCard streak={streak} />
          <WeekSummaryCard week={data.week} />
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
