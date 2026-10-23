import { MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';
import { getMeetingPointsData } from '@/modules/support';
import { DatedRecordModule } from '@/modules/support/components/dated-record-module';
import { canManageCompanySettings, getCompanySettings } from '@/modules/settings';
import { MeetingAgenda } from '@/modules/settings/components/meeting-agenda';
import { requireProfile } from '@/shared/session/profile';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Meeting points' };

export default async function MeetingPointsPage() {
  const [user,{period,members,tasks,entries},settings]=await Promise.all([requireProfile(),getMeetingPointsData(),getCompanySettings()]);
  return <MissionPage>
    <MissionPageHeader eyebrow="Records" title="Meeting Points" description={`${period.label} - issues, resolutions and linked work`}/>
    <MeetingAgenda agenda={settings.meetingAgenda} canEdit={settings.available&&canManageCompanySettings(user.role)}/>
    <DatedRecordModule kind="meeting" user={user} members={members} tasks={tasks} entries={entries}/>
  </MissionPage>;
}
