import { cache } from 'react';
import { getAwards } from '@/modules/scoring';
import { awaitingAttendance, LAST_CALCULATED_STEPS } from '@/modules/scoring/client';
import { previousDate } from './context';
import { createClient } from '@/shared/supabase/server';
import { buildPresentation } from './model';
import { liveWindowEnd } from '@/shared/time/period';
import type { ViewContext } from './context';
// series: the per-day recomputation only the profile charts use; it is slow, so opt in.
const load=cache(async(start:string,end:string,asOf:string,employee:string|null,series:boolean)=>{
 const db=await createClient();const result=await db.rpc('live_presentation_context',{p_from:start,p_to_exclusive:end,p_as_of:asOf,p_employee:employee,p_series:series});
 if(result.error)throw new Error('Live presentation source read failed: '+result.error.message);
 return result.data;
});
export async function getLivePresentation(view:ViewContext,employee:string|null=null,{series=false}:{series?:boolean}={}){
 // Only days that have ended by the as-of time are read (today's unfinished day never blocks).
 const start=view.period.startDate;
 let end=liveWindowEnd(view.period,view.asOf);
 let model=buildPresentation(await load(start,end,view.asOf,employee,series),view,employee,end);
 // Until last night's attendance is marked nobody can be scored; show the last calculated
 // figures (a window one day shorter, up to LAST_CALCULATED_STEPS days) rather than blanks.
 for(let step=0;step<LAST_CALCULATED_STEPS&&awaitingAttendance(model.calculation)&&previousDate(end)>start;step++){
  end=previousDate(end);
  const earlier=buildPresentation(await load(start,end,view.asOf,employee,series),view,employee,end);
  if(!awaitingAttendance(earlier.calculation)){model=earlier;break;}
 }
 const db=await createClient();
 try{model.awards=await getAwards(db,view.period,model.calculation,employee??undefined);}catch(error){
  if(!(error instanceof Error)||!error.message.startsWith('Award and performance sources changed'))throw error;
  model.awards=await getAwards(db,view.period,undefined,employee??undefined);model.awardAvailabilityReason='Awards were decided from a different reading of the month than the one shown, so the star of the month is not shown here. Choose "Latest" to see it.';
 }
 if(model.awards.days.some(d=>d.lastRunAt&&new Date(d.lastRunAt)>new Date(view.asOf))){
  model.awardAvailabilityReason='Awards for this month were recalculated after this moment. The award history below shows each version; the star of the month as it stood then is not available.';
  model.awards={...model.awards,days:model.awards.days.filter(d=>!d.lastRunAt||new Date(d.lastRunAt)<=new Date(view.asOf)),history:model.awards.history.filter(h=>new Date(h.createdAt)<=new Date(view.asOf)),monthly:{...model.awards.monthly,status:'incomplete',winnerId:null,counts:{},reasons:['historical_effective_award_context_unavailable']}};
 }
 return model;
}
