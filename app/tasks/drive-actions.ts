'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentProfile } from '@/shared/session/profile';
import { createClient } from '@/shared/supabase/server';
import type { ActionResponse } from '@/types/tracker';
import type { Json } from '@/types/database';
import { DRIVE_INTEGRATION_DEFERRED,DRIVE_UNAVAILABLE_MESSAGE } from '@/lib/integrations/drive/availability';
export async function requestDriveOperation(form:FormData):Promise<ActionResponse<Json>>{
 if(DRIVE_INTEGRATION_DEFERRED)return {success:false,error:DRIVE_UNAVAILABLE_MESSAGE};
 const profile=await getCurrentProfile();if(!profile?.isActive)return {success:false,error:'Active authentication required.'};
 const read=(key:string)=>String(form.get(key)??'').trim(),version=read('expectedVersion');
 if(!/^\d+$/.test(version))return {success:false,error:'Reload the task first.'};
 const db=await createClient();const {data,error}=await db.rpc('drive_command',{p_task:read('taskId'),p_command:read('command'),p_payload:{name:read('name'),ipoRole:read('ipoRole'),fileKind:read('fileKind'),templateKey:read('templateKey'),assetKey:read('assetKey'),jobId:read('jobId')},p_expected_version:Number(version),p_operation:read('operationId')});
 if(error)return {success:false,error:error.code==='40001'?'Task changed. Reload and review the current task.':error.message};
 revalidatePath('/task-tools');revalidatePath('/tasks/[taskTag]','page');return {success:true,data};
}
