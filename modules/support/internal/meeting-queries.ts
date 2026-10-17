import { kolkataDate } from '@/shared/time/kolkata';
import { currentPeriod, type AnalyticsPeriod } from '@/lib/analytics/engine';
import { mapUser, USER_COLUMNS } from '@/shared/supabase/mappers';
import { createClient } from '@/shared/supabase/server';
import type { User } from '@/types/tracker';

import type { DatedEntry, TaskChoice } from '../components/dated-record-module';

export interface MeetingPointsData {
  readonly period: AnalyticsPeriod;
  readonly members: readonly User[];
  readonly tasks: readonly TaskChoice[];
  readonly entries: readonly DatedEntry[];
}

/** Meeting points in the current Asia/Kolkata period, with members and task choices. */
export async function getMeetingPointsData(): Promise<MeetingPointsData> {
  const db=await createClient(),period=currentPeriod(new Date(kolkataDate()+'T12:00:00Z'));
  const [records,members,tasks]=await Promise.all([
    db.from('meeting_points').select('*').gte('meeting_date',period.startDate).lte('meeting_date',period.endDate).order('meeting_date',{ascending:false}),
    db.from('users').select(USER_COLUMNS).order('full_name'),db.from('tasks').select('id, task_tag, title'),
  ]);
  for(const result of [records,members,tasks])if(result.error)throw new Error(`Meeting inputs unavailable: ${result.error.message}`);
  return {
    period,
    members:members.data!.map(mapUser),
    tasks:tasks.data!.map(t=>({id:t.id,tag:t.task_tag,title:t.title})),
    entries:records.data!.map(r=>({id:r.id,businessDate:r.meeting_date,authorId:r.posted_by,content:r.point,assetUrl:r.folder_url,recordVersion:r.record_version??0,validationState:r.validation_state??'legacy_unvalidated',validationAt:r.validation_at??null,validatorId:r.validated_by??null,validationReason:r.validation_reason??null,relatedTaskId:r.related_task_id??null,extras:{meeting_type:r.meeting_type,owner_id:r.owner_id??null,point_type:r.point_type??null,resolution:r.resolution??null,comments:r.comments??null,resolution_status:r.resolution_status??null,resolution_due:r.resolution_due??null,resolved_on:r.resolved_on??null}})),
  };
}
