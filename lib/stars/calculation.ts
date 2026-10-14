import type { createClient } from '@/lib/supabase/server';
import { loadPerformance } from '@/lib/performance/queries';
import { awardContext,selectDaily,APPROVED_AWARD_POLICY,type AwardPolicy,type AwardGate } from './contract';
import { Exact } from '@/lib/performance/exact';
type Client=Awaited<ReturnType<typeof createClient>>;
export async function calculateAward(db:Client,date:string,executionTime:string,policy:AwardPolicy|null=APPROVED_AWARD_POLICY,isRevision=false) {
 const asOf=executionTime;
 if(!policy)return {status:'blocked' as const,winnerId:null,reasons:['award_policy_unapproved'],context:{businessDate:date,asOf},candidates:[]};
 const initial=awardContext(date,asOf,policy);
 if(new Date(asOf).getTime()<new Date(initial.cutoff).getTime())return {status:'blocked' as const,winnerId:null,reasons:['award_cutoff_not_reached'],context:initial,candidates:[]};
 const context={...initial,asOf:isRevision?executionTime:initial.cutoff};
 const {sources,calculation}=await loadPerformance(db,context.periodStart,context.periodEndExclusive,context.asOf);
 // A separate day context resolves participation; scoring/report validity keep the approved window.
 const day=await loadPerformance(db,date,context.periodEndExclusive,context.asOf);
 if(day.sources.sourceWatermark!==sources.sourceWatermark)throw new Error('Award sources changed while resolving daily eligibility.');
 const gates:AwardGate[]=sources.members.filter(m=>m.active).map(m=>{
  const today=day.sources.attendance.find(a=>a.userId===m.id),report=sources.attendance.find(a=>a.userId===m.id);
  if(today?.valid===false||report?.valid===false)return {userId:m.id,state:'ineligible',reasons:['attendance_invalid']};
  if(!today?.available||!report?.available||today.valid!==true||report.valid!==true)return {userId:m.id,state:'unavailable',reasons:['attendance_evidence_unavailable']};
  if(policy.requirePositiveDayAttendance&&(today.hours===null||Exact.from(today.hours).compare(Exact.from(0))<=0))return {userId:m.id,state:'ineligible',reasons:['no_regular_attendance_on_award_day']};
  return {userId:m.id,state:'eligible',reasons:[]};
 });
 return {...selectDaily(calculation,gates,policy),context:{...context,sourceWatermark:sources.sourceWatermark}};
}
