import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { DatedRecordModule } from '@/components/support/dated-record-module';
import { requireProfile } from '@/lib/auth/profile';
import { createClient } from '@/lib/supabase/server';
import { mapUser, USER_COLUMNS } from '@/lib/supabase/mappers';
import { kolkataDate } from '@/lib/tasks/contract';
import { currentPeriod } from '@/lib/analytics/engine';
export default async function MeetingPointsPage() {
  const user=await requireProfile(),db=await createClient(),period=currentPeriod(new Date(kolkataDate()+'T12:00:00Z'));
  const [records,members,tasks]=await Promise.all([
    db.from('meeting_points').select('*').gte('meeting_date',period.startDate).lte('meeting_date',period.endDate).order('meeting_date',{ascending:false}),
    db.from('users').select(USER_COLUMNS).order('full_name'),db.from('tasks').select('id, task_tag, title'),
  ]);
  for(const result of [records,members,tasks])if(result.error)throw new Error(`Meeting inputs unavailable: ${result.error.message}`);
  return <><WorkspaceHeader title="Meeting Points" description={`${period.label} - issues, resolutions and linked work`}/><div className="px-4 py-4 lg:px-6"><DatedRecordModule kind="meeting" user={user} members={members.data!.map(mapUser)} tasks={tasks.data!.map(t=>({id:t.id,tag:t.task_tag,title:t.title}))} entries={records.data!.map(r=>({id:r.id,businessDate:r.meeting_date,authorId:r.posted_by,content:r.point,assetUrl:r.folder_url,recordVersion:r.record_version??0,validationState:r.validation_state??'legacy_unvalidated',validationAt:r.validation_at??null,validatorId:r.validated_by??null,validationReason:r.validation_reason??null,relatedTaskId:r.related_task_id??null,extras:{meeting_type:r.meeting_type,owner_id:r.owner_id??null,point_type:r.point_type??null,resolution:r.resolution??null,comments:r.comments??null,resolution_status:r.resolution_status??null,resolution_due:r.resolution_due??null,resolved_on:r.resolved_on??null}}))}/></div></>;
}
