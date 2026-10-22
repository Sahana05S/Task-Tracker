'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentProfile } from '@/shared/session/profile';
import type { ActionResponse } from '@/types/tracker';
import { beginMonthCorrection,captureMonth } from '@/modules/reports/internal/month/archive';

export interface MonthActionState {ok:boolean;message:string}
const MONTH_DONE:Record<string,string>={begin_correction:'Correction opened.',draft:'Draft saved.',close:'Month closed.',revise:'New revision published.'};
export async function monthArchiveAction(_previous:MonthActionState,form:FormData):Promise<MonthActionState>{
 const actor=await getCurrentProfile();
 if(!actor?.isActive||actor.role!=='managing_director')return {ok:false,message:'An active managing director is required.'};
 const command=String(form.get('command')??''),period=String(form.get('period')??''),reason=String(form.get('reason')??'');
 const version=Number(form.get('version'));
 if(!Number.isSafeInteger(version)||version<0)return {ok:false,message:'Refresh the period version.'};
 // The submitted operation survives network retries; the database owns replay detection.
 const operation=String(form.get('operation')??'');
 if(!/^[0-9a-f-]{36}$/i.test(operation))return {ok:false,message:'Refresh the operation key.'};
 try{
  if(command==='begin_correction'){
   const kind=String(form.get('kind')??''),id=String(form.get('recordId')??''),from=String(form.get('from')??''),through=String(form.get('through')??'');
   await beginMonthCorrection(period,version,operation,reason,[{kind,id,from,through}]);
  }else if(command==='draft'||command==='close'||command==='revise')await captureMonth(command,period,version,operation,reason);
  else return {ok:false,message:'Unsupported month command.'};
  revalidatePath('/reports');
  return {ok:true,message:MONTH_DONE[command]};
 }catch(error){return {ok:false,message:error instanceof Error?error.message:'Month command failed.'};}
}

export interface SnapshotSummary {periodLabel:string;memberCount:number;starPerformer:string|null}

/** Retained only so old clients cannot reach the former overwriteable upsert. */
export async function freezeMonthlySnapshot(_year?:number,_month?:number): Promise<ActionResponse<SnapshotSummary>> {
  return { success: false, error: 'The old Freeze action is retired. Use the versioned month archive controls in Reports.' };
}
