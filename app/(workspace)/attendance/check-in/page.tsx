import type { Metadata } from 'next';

import { CheckInDay } from '@/modules/attendance/components/check-in-day';
import { getDayCheckIns } from '@/modules/attendance';
import { formatTimeBlocks, timeBlockDay } from '@/modules/attendance/client';
import { dailyReportText, getLivePresentation, liveViewContext } from '@/modules/reports';
import { getCompanySettings, type AttendanceSettings } from '@/modules/settings';
import { getMemberDaySessions } from '@/modules/time-tracking';
import { requireProfile } from '@/shared/session/profile';
import { kolkataDate } from '@/shared/time/kolkata';

export const metadata: Metadata = { title: 'Check in' };

export default async function CheckInPage() {
  const user = await requireProfile();
  const today = kolkataDate();
  const [day, settings] = await Promise.all([getDayCheckIns(user.id, today), getCompanySettings()]);
  // The check-out message is the daily report (user decision, 3 November 2026). It is read only
  // once the day is checked out, and a failed read leaves just the check-in and check-out times.
  // Since 4 November 2026 today's work is listed in four time blocks between the break times;
  // when that read fails, the report keeps today's logs instead.
  const [blocks, report] = day.in && day.out
    ? await (async () => {
      const blockText = await todaysBlocks(user.id, today, day.in!.capturedAt, day.out!.capturedAt, settings.attendance);
      return [blockText, await todaysReport(user.id, today, blockText === '')] as const;
    })()
    : [undefined, undefined];
  return <CheckInDay email={user.email} fullName={user.fullName} day={day} settings={settings.attendance} report={report} blocks={blocks} />;
}

async function todaysReport(userId: string, today: string, includeToday: boolean): Promise<string> {
  try {
    const model = await getLivePresentation(await liveViewContext(), userId);
    return dailyReportText(model, userId, today, { includeToday });
  } catch {
    return '';
  }
}

async function todaysBlocks(userId: string, today: string, checkedInAt: string, checkedOutAt: string, breaks: AttendanceSettings): Promise<string> {
  try {
    const { sessions, manual } = await getMemberDaySessions(userId, today);
    return formatTimeBlocks(timeBlockDay({ date: today, checkedInAt, checkedOutAt, breaks, sessions, manual }));
  } catch {
    return '';
  }
}
