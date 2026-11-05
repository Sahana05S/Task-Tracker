import Link from 'next/link';
import { CameraIcon, CheckCircle2Icon, MessageCircleIcon } from 'lucide-react';

import type { CheckInKind, CheckInMark } from '@/modules/attendance/client';
import type { AttendanceSettings } from '@/modules/settings/client';
import { EmptyState, MissionNotice, MissionPage, MissionPageHeader, MissionPanel } from '@/shared/ui/mission-ui';
import { CheckInForm } from './check-in-form';
import { CheckInShare } from './check-in-share';

/**
 * The `/attendance/check-in` page body: check in when the day has no check-in,
 * check out after one, and a summary once both are done. After checking in the
 * member can send a greeting on WhatsApp, and after checking out their daily
 * report (user decision, 3 November 2026); they choose who receives it. Right
 * after a save here WhatsApp opens with that message by itself (5 November 2026).
 */
export function CheckInDay({ email, day, settings, share }: {
  email: string;
  day: { in: CheckInMark | null; out: CheckInMark | null; recorded: boolean; available: boolean };
  settings: AttendanceSettings;
  /** Today's drafted message: the greeting once checked in, the daily report once checked out. */
  share: { kind: CheckInKind; text: string; title: string } | null;
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
      {day.available && settings.checkInEnabled && share ? (
        <MissionPanel icon={MessageCircleIcon} title={share.kind === 'out' ? 'Share your day' : 'Tell your team you’re in'}
          subtitle={`${share.kind === 'out' ? 'Your daily report' : 'A greeting with your check-in time'}. WhatsApp opens after you save; it asks who to send it to.`}>
          <CheckInShare kind={share.kind} text={share.text} title={share.title} />
        </MissionPanel>
      ) : null}
    </MissionPage>
  );
}
