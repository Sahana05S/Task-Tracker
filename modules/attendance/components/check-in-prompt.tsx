import { getDayCheckIns } from '@/modules/attendance/internal/check-in';
import type { CheckInKind, CheckInMark } from '@/modules/attendance/internal/check-in-model';
import { getCompanySettings, type AttendanceSettings } from '@/modules/settings';
import { kolkataDate } from '@/shared/time/kolkata';
import { CheckInCard } from './check-in-card';

/**
 * The Today page's check-in card: "Check in" until today has a check-in, then
 * "Check out", then "Share your day". Each opens the check-in form (or, once
 * the day is done, the drafted report) in a sheet on Today; WhatsApp opens by
 * itself after a save. Hidden when the company has photo check-in off or the
 * database predates migration 72. `loadShare` composes today's drafted message
 * (the route layer reads the reports module for the check-out report).
 */
export async function CheckInPrompt({ user, loadShare }: {
  user: { id: string; email: string; fullName: string };
  loadShare: (
    day: { in: CheckInMark | null; out: CheckInMark | null },
    settings: AttendanceSettings,
  ) => Promise<{ kind: CheckInKind; text: string; title: string } | null>;
}) {
  const [day, settings] = await Promise.all([getDayCheckIns(user.id, kolkataDate()), getCompanySettings()]);
  if (!day.available || !settings.attendance.checkInEnabled) return null;
  const attendance = settings.attendance;
  const share = await loadShare(day, attendance).catch(() => null);
  const office = attendance.officeLatitude !== null && attendance.officeLongitude !== null
    ? { latitude: attendance.officeLatitude, longitude: attendance.officeLongitude, radiusM: attendance.officeRadiusM } : null;
  return <CheckInCard email={user.email} office={office} todayIn={day.in} todayOut={day.out} share={share} />;
}
