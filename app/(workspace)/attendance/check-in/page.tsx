import type { Metadata } from 'next';

import { CheckInDay } from '@/modules/attendance/components/check-in-day';
import { getDayCheckIns } from '@/modules/attendance';
import { dailyReportText, getLivePresentation, liveViewContext } from '@/modules/reports';
import { getCompanySettings } from '@/modules/settings';
import { requireProfile } from '@/shared/session/profile';
import { kolkataDate } from '@/shared/time/kolkata';

export const metadata: Metadata = { title: 'Check in' };

export default async function CheckInPage() {
  const user = await requireProfile();
  const today = kolkataDate();
  const [day, settings] = await Promise.all([getDayCheckIns(user.id, today), getCompanySettings()]);
  // The check-out message is the daily report (user decision, 3 November 2026). It is read only
  // once the day is checked out, and a failed read leaves just the check-in and check-out times.
  const report = day.in && day.out ? await todaysReport(user.id, today) : undefined;
  return <CheckInDay email={user.email} fullName={user.fullName} day={day} settings={settings.attendance} report={report} />;
}

async function todaysReport(userId: string, today: string): Promise<string> {
  try {
    const model = await getLivePresentation(await liveViewContext(), userId);
    return dailyReportText(model, userId, today);
  } catch {
    return '';
  }
}
