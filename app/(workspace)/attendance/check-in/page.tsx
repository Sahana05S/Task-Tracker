import type { Metadata } from 'next';

import { CheckInDay } from '@/modules/attendance/components/check-in-day';
import { getDayCheckIns } from '@/modules/attendance';
import { getCompanySettings } from '@/modules/settings';
import { requireProfile } from '@/shared/session/profile';
import { kolkataDate } from '@/shared/time/kolkata';

export const metadata: Metadata = { title: 'Check in' };

export default async function CheckInPage() {
  const user = await requireProfile();
  const today = kolkataDate();
  const [day, settings] = await Promise.all([getDayCheckIns(user.id, today), getCompanySettings()]);
  return <CheckInDay email={user.email} day={day} settings={settings.attendance} />;
}
