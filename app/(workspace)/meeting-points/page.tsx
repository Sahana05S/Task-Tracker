import { MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';
import { getMeetingPointsData } from '@/modules/support';
import { canManageSupportRecords } from '@/modules/support/client';
import { DatedRecordModule } from '@/modules/support/components/dated-record-module';
import { canManageCompanySettings, getCompanySettings } from '@/modules/settings';
import { MeetingAgenda } from '@/modules/settings/components/meeting-agenda';
import { getLabelCatalogue, getLabelsFor } from '@/modules/labels';
import { LabelInput } from '@/modules/labels/components/label-input';
import { requireProfile } from '@/shared/session/profile';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Meeting points' };

export default async function MeetingPointsPage() {
  const [user,{period,members,tasks,entries},settings,catalogue]=await Promise.all([requireProfile(),getMeetingPointsData(),getCompanySettings(),getLabelCatalogue()]);
  // Labels (migration 112): managers, data managers and a point's author may change them; label_link_command enforces it.
  const labels=catalogue?await getLabelsFor('meeting_point',entries.map(e=>e.id)):null;
  const extras=catalogue&&labels?Object.fromEntries(entries.filter(e=>e.validationState!=='withdrawn').map(e=>[e.id,<LabelInput key={e.id} kind="meeting_point" subjectId={e.id} labels={labels[e.id]??[]} catalogue={catalogue.labels} canEdit={user.isActive&&(canManageSupportRecords(user.role)||e.authorId===user.id)} canCreate={catalogue.canManage} hideEmpty className="border-border border-t pt-3"/>])):undefined;
  return <MissionPage>
    <MissionPageHeader eyebrow="Records" title="Meeting Points" description={`${period.label} - issues, resolutions and linked work`}/>
    <MeetingAgenda agenda={settings.meetingAgenda} canEdit={settings.available&&canManageCompanySettings(user.role)}/>
    <DatedRecordModule kind="meeting" user={user} members={members} tasks={tasks} entries={entries} extras={extras}/>
  </MissionPage>;
}
