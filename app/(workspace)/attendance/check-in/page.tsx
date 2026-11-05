import type { Metadata } from 'next';

import { CheckInDay } from '@/modules/attendance/components/check-in-day';
import { getDayCheckIns } from '@/modules/attendance';
import { getCompanySettings } from '@/modules/settings';
import { requireProfile } from '@/shared/session/profile';
import { kolkataDate } from '@/shared/time/kolkata';
import { dayShare } from './day-share';

export const metadata: Metadata = { title: 'Check in' };

export default async function CheckInPage() {
  const user = await requireProfile();
  const today = kolkataDate();
  const [day, settings] = await Promise.all([getDayCheckIns(user.id, today), getCompanySettings()]);
  const share = day.available && settings.attendance.checkInEnabled ? await dayShare(user, today, day, settings.attendance) : null;
  return <CheckInDay email={user.email} day={day} settings={settings.attendance} share={share} />;
}
