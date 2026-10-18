import { cache } from 'react';
import { getAwards } from '@/modules/scoring';
import { createClient } from '@/shared/supabase/server';
import { buildPresentation } from './model';
import { nextDate,type ViewContext } from './context';
const load=cache(async(start:string,end:string,asOf:string,employee:string|null)=>{
 const db=await createClient();const result=await db.rpc('live_presentation_context',{p_from:start,p_to_exclusive:end,p_as_of:asOf,p_employee:employee});
 if(result.error)throw new Error('Live presentation source read failed: '+result.error.message);
 return result.data;
});
export async function getLivePresentation(view:ViewContext,employee:string|null=null){
 const model=buildPresentation(await load(view.period.startDate,nextDate(view.period.endDate),view.asOf,employee),view,employee);
 const db=await createClient();
 try{model.awards=await getAwards(db,view.period,model.calculation,employee??undefined);}catch(error){
  if(!(error instanceof Error)||!error.message.startsWith('Award and performance sources changed'))throw error;
  model.awards=await getAwards(db,view.period,undefined,employee??undefined);model.awardAvailabilityReason='Award ledger and selected calculation have different source contexts. Monthly selection is unavailable.';
 }
 if(model.awards.days.some(d=>d.lastRunAt&&new Date(d.lastRunAt)>new Date(view.asOf))){
  model.awardAvailabilityReason='Later award revisions exist. Retained award history is shown separately; historical effective selection is unavailable.';
  model.awards={...model.awards,days:model.awards.days.filter(d=>!d.lastRunAt||new Date(d.lastRunAt)<=new Date(view.asOf)),history:model.awards.history.filter(h=>new Date(h.createdAt)<=new Date(view.asOf)),monthly:{...model.awards.monthly,status:'incomplete',winnerId:null,counts:{},reasons:['historical_effective_award_context_unavailable']}};
 }
 return model;
}
