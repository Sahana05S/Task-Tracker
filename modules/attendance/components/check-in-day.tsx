import Link from 'next/link';
import { CameraIcon, CheckCircle2Icon, MessageCircleIcon } from 'lucide-react';

import { checkInMessage, checkOutMessage, type CheckInMark } from '@/modules/attendance/client';
import type { AttendanceSettings } from '@/modules/settings/client';
import { EmptyState, MissionNotice, MissionPage, MissionPageHeader, MissionPanel } from '@/shared/ui/mission-ui';
import { ShareText } from '@/shared/ui/share-text';
import { CheckInForm } from './check-in-form';

/**
 * The `/attendance/check-in` page body: check in when the day has no check-in,
 * check out after one, and a summary once both are done. After checking in the
 * member can send a greeting on WhatsApp, and after checking out their daily
 * report (user decision, 3 November 2026); they choose who receives it.
 */
export function CheckInDay({ email, fullName, day, settings, report, blocks }: {
  email: string;
  fullName: string;
  day: { in: CheckInMark | null; out: CheckInMark | null; recorded: boolean; available: boolean };
  settings: AttendanceSettings;
  /** The member's daily report text for today; read only once they have checked out. */
  report?: string;
  /** Today in time blocks between the break times (`formatTimeBlocks`); read once they have checked out. */
  blocks?: string;
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
          <CheckInForm kind={kind} email={email} office={office} todayIn={day.in} backHref="/today" />
        </MissionPanel>
      )}
      {day.available && settings.checkInEnabled && day.in ? (
        day.out ? (
          <MissionPanel icon={MessageCircleIcon} title="Share your day" subtitle="Your daily report, ready to send. WhatsApp asks who to send it to.">
            <ShareText text={checkOutMessage(day.in.capturedAt, day.out.capturedAt, report ?? '', blocks ?? '')} title={`Daily report · ${fullName}`} />
          </MissionPanel>
        ) : (
          <MissionPanel icon={MessageCircleIcon} title="Tell your team you’re in" subtitle="A greeting with your check-in time. WhatsApp asks who to send it to.">
            <ShareText text={checkInMessage(fullName, day.in.capturedAt)} title={`${fullName} checked in`} />
          </MissionPanel>
        )
      ) : null}
    </MissionPage>
  );
}
