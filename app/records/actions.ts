'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentProfile } from '@/lib/auth/profile';
import { createClient } from '@/lib/supabase/server';
import { localCheckTime } from '@/lib/attendance/contract';
import type { ActionResponse } from '@/types/tracker';
import type { Json } from '@/types/database';
const read=(f:FormData,k:string)=>String(f.get(k)??'').trim();
export async function writeDatedRecord(form:FormData):Promise<ActionResponse<{id:string;version:number}>> {
  const profile=await getCurrentProfile();if(!profile?.isActive)return {success:false,error:'Active authentication required.'};
  const kind=read(form,'kind'),command=read(form,'command')||'save';
  const payload:Record<string,Json>={reason:read(form,'reason')||null};
  if(command==='save') {
    for(const key of ['business_date','author_id','content'])payload[key]=read(form,key)||null;
    if(kind==='attendance') {
      payload.attendance_status=read(form,'attendance_status');
      for(const key of ['attendance_hours','off_hours']) {const value=read(form,key);if(!value||!Number.isFinite(Number(value)))return {success:false,error:'Enter measured hours explicitly; blank is not zero.'};payload[key]=value;}
      try {payload.check_in_at=localCheckTime(read(form,'business_date'),read(form,'check_in_time'));payload.check_out_at=localCheckTime(read(form,'business_date'),read(form,'check_out_time'));}catch{return {success:false,error:'Check times must be valid local times.'};}
      payload.holiday_name=read(form,'holiday_name')||null;
    } else {
      payload.asset_url=read(form,'asset_url')||null;payload.related_task_id=read(form,'related_task_id')||null;
      if(kind==='sale') {
        for(const key of ['project_built_up_area','project_location','client_name'])payload[key]=read(form,key)||null;
        for(const key of ['is_new_project','basement_payment_received'])payload[key]=form.get(key)==='on'||form.get(key)==='true';
      }
      if(kind==='meeting')for(const key of ['meeting_type','owner_id','point_type','resolution','comments','resolution_status','resolution_due','resolved_on'])payload[key]=read(form,key)||null;
    }
  } else if(command==='validate')payload.state=read(form,'state');
  const version=read(form,'expectedVersion');if(!/^\d+$/.test(version))return {success:false,error:'Reload the current record before saving.'};
  const db=await createClient();const {data,error}=await db.rpc('dated_record_command',{p_kind:kind,p_id:read(form,'recordId')||null,p_command:command,p_payload:payload,p_expected_version:Number(version),p_operation:read(form,'operationId')});
  if(error)return {success:false,error:error.message,errorCode:error.code==='40001'?'conflict':error.code==='42501'?'forbidden':'validation'};
  if(!data||typeof data!=='object'||Array.isArray(data)||typeof data.id!=='string'||typeof data.version!=='number')return {success:false,error:'Invalid saved-record response.',errorCode:'unavailable'};
  for(const path of ['/attendance','/daily-facts','/ideas','/suggestions','/sales','/meeting-points','/dashboard','/team','/task-tools'])revalidatePath(path);
  return {success:true,data:{id:data.id,version:data.version}};
}
