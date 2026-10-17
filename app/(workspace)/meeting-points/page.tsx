import { MissionPage, MissionPageHeader } from '@/components/missions/mission-ui';
import { getMeetingPointsData } from '@/modules/support';
import { DatedRecordModule } from '@/modules/support/components/dated-record-module';
import { requireProfile } from '@/shared/session/profile';
export default async function MeetingPointsPage() {
  const user=await requireProfile(),{period,members,tasks,entries}=await getMeetingPointsData();
  return <MissionPage><MissionPageHeader eyebrow="Records" title="Meeting Points" description={`${period.label} - issues, resolutions and linked work`}/><DatedRecordModule kind="meeting" user={user} members={members} tasks={tasks} entries={entries}/></MissionPage>;
}
