import Link from 'next/link';
import { CameraIcon, CheckCircle2Icon } from 'lucide-react';

import type { CheckInMark } from '@/modules/attendance/client';
import type { AttendanceSettings } from '@/modules/settings/client';
import { EmptyState, MissionNotice, MissionPage, MissionPageHeader, MissionPanel } from '@/shared/ui/mission-ui';
import { CheckInForm } from './check-in-form';

/**
 * The `/attendance/check-in` page body: check in when the day has no check-in,
 * check out after one, and a summary once both are done.
 */
export function CheckInDay({ email, day, settings }: {
  email: string;
  day: { in: CheckInMark | null; out: CheckInMark | null; recorded: boolean; available: boolean };
  settings: AttendanceSettings;
}) {
  const kind = day.in ? 'out' : 'in';
  const title = day.in && day.out ? 'Checked out' : kind === 'in' ? 'Check in' : 'Check out';
  const office = settings.officeLatitude !== null && settings.officeLongitude !== null
    ? { latitude: settings.officeLatitude, longitude: settings.officeLongitude, radiusM: settings.officeRadiusM } : null;
  return (
    <MissionPage className="max-w-xl">
      <MissionPageHeader eyebrow="Attendance" title={title} description="Take a photo when you arrive and when you leave. The time and place are filled in for you." />
      {!day.available ? (
        <MissionNotice tone="attention" role="status">Photo check-in needs the latest database update (migration 72).</MissionNotice>
      ) : !settings.checkInEnabled ? (
        <EmptyState title="Photo check-in is off" action={<Link href="/attendance" className="link text-sm">Open attendance</Link>}>
          Your company records attendance in the attendance table instead.
        </EmptyState>
      ) : day.in && day.out ? (
        <MissionPanel icon={CheckCircle2Icon} title="All done for today">
          <div className="grid gap-3 text-sm">
            <p>Checked in at {day.in.time} and out at {day.out.time}.</p>
            <Link href="/attendance" className="link justify-self-start">See your attendance</Link>
          </div>
        </MissionPanel>
      ) : (
        <MissionPanel icon={CameraIcon} title={kind === 'in' ? 'Arriving' : 'Leaving'}>
          <CheckInForm kind={kind} email={email} office={office} todayIn={day.in} backHref="/dashboard" />
        </MissionPanel>
      )}
    </MissionPage>
  );
}
