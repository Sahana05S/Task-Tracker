import 'server-only';

import { checkInMessage, checkOutMessage, formatTimeBlocks, timeBlockDay, type CheckInKind, type CheckInMark } from '@/modules/attendance/client';
import { dailyReportText, getLivePresentation, liveViewContext } from '@/modules/reports';
import type { AttendanceSettings } from '@/modules/settings';
import { getMemberDaySessions } from '@/modules/time-tracking';

export interface DayShare { kind: CheckInKind; text: string; title: string }

/**
 * The message a member sends for today (user decisions, 3 and 4 November 2026):
 * after checking in, the greeting; after checking out, both times, today in
 * four time blocks and the daily report. Used by the check-in page and the
 * Today check-in card. The report is read only once the day is checked out;
 * a failed read leaves just the times, and when the blocks cannot be read the
 * report keeps today's logs instead.
 */
export async function dayShare(
  user: { id: string; fullName: string },
  today: string,
  day: { in: CheckInMark | null; out: CheckInMark | null },
  breaks: AttendanceSettings,
): Promise<DayShare | null> {
  if (!day.in) return null;
  if (!day.out) return { kind: 'in', text: checkInMessage(user.fullName, day.in.capturedAt), title: `${user.fullName} checked in` };
  const blocks = await todaysBlocks(user.id, today, day.in.capturedAt, day.out.capturedAt, breaks);
  const report = await todaysReport(user.id, today, blocks === '');
  return { kind: 'out', text: checkOutMessage(day.in.capturedAt, day.out.capturedAt, report, blocks), title: `Daily report · ${user.fullName}` };
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
