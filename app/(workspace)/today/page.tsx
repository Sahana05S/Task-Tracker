import type { Metadata } from 'next';

import {
  AnalyticsTeaser,
  FocusMissions,
  RecognisedContributions,
  StarCalendar,
  StarStatusCard,
  WeekSummaryCard,
} from '@/modules/workspace-views/components/today/today-sections';
import { requireProfile } from '@/shared/session/profile';
import { getTodayData } from '@/modules/workspace-views';

export const metadata: Metadata = { title: 'Today · TaskPulse' };

/**
 * Personal Today page (layout reference: Stitch today_dashboard_2). Every
 * figure comes from existing data under the caller's permissions; sections show
 * explicit empty or unavailable states. No new gamification rules: the star
 * content presents existing daily awards and validated contributions only.
 */
export default async function TodayPage() {
  const profile = await requireProfile();
  const data = await getTodayData(profile.id);
  const date = new Date(`${data.today}T00:00:00Z`);
  const dateLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date);
  const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pt-6 pb-10 lg:px-6">
      <header className="mb-5">
        <h1 className="text-foreground text-[1.625rem] leading-tight font-bold tracking-tight lg:text-[2rem]">Today</h1>
        <p className="text-muted-foreground mt-1 text-sm">{dateLabel} · Make room for meaningful progress.</p>
      </header>
      <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
        <div className="grid content-start gap-4 lg:col-span-8 lg:gap-6">
          <StarStatusCard awards={data.awards} today={data.today} userId={profile.id} names={data.names}
            profileHref={`/team/${encodeURIComponent(profile.employeeId)}`} />
          <FocusMissions focus={data.focus} today={data.today} />
        </div>
        <div className="grid content-start gap-4 md:grid-cols-2 lg:col-span-4 lg:grid-cols-1 lg:gap-6">
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
