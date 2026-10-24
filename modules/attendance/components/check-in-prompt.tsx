import Link from 'next/link';
import { CameraIcon } from 'lucide-react';

import { getDayCheckIns } from '@/modules/attendance/internal/check-in';
import { getCompanySettings } from '@/modules/settings';
import { kolkataDate } from '@/shared/time/kolkata';

/**
 * The Today page's check-in button: "Check in" until today has a check-in,
 * then "Check out", then nothing. Hidden when the company has photo check-in
 * off or the database predates migration 72.
 */
export async function CheckInPrompt({ userId }: { userId: string }) {
  const [day, settings] = await Promise.all([getDayCheckIns(userId, kolkataDate()), getCompanySettings()]);
  if (!day.available || !settings.attendance.checkInEnabled || (day.in && day.out)) return null;
  return (
    <Link href="/attendance/check-in" className="bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:outline-primary inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold">
      <CameraIcon className="size-4" aria-hidden="true" />
      {day.in ? `Check out (in at ${day.in.time})` : 'Check in'}
    </Link>
  );
}
