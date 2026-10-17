'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentProfile } from '@/shared/session/profile';
import { createClient } from '@/shared/supabase/server';
import { DETAIL_FIELDS } from '@/lib/tasks/details-contract';
import type { Json } from '@/types/database';
import type { ActionResponse } from '@/types/tracker';
const read=(f:FormData,k:string)=>String(f.get(k)??'').trim();
async function execute(form:FormData,command:string,payload:Json):Promise<ActionResponse<Json>> {
 const profile=await getCurrentProfile();if(!profile?.isActive) return {success:false,error:'Active authentication required.'};
 const version=read(form,'expectedVersion');if(!/^\d+$/.test(version)) return {success:false,error:'Reload the task before saving.'};
 const db=await createClient();const {data,error}=await db.rpc('task_details_command',{p_task:read(form,'taskId'),p_command:command,p_payload:payload,p_expected_version:Number(version),p_operation:read(form,'operationId')});
 if(error) return {success:false,error:error.code==='40001'?'Task changed. Reload and review the current details.':error.message};
 revalidatePath('/tasks');revalidatePath('/task-tools');revalidatePath('/tasks/[taskTag]','page');revalidatePath('/tasks/[taskTag]/checklist','page');
 return {success:true,data};
}
export async function initializeTaskDetails(form:FormData){return execute(form,'initialize',{template_version_id:read(form,'templateVersionId')||null});}
export async function saveTaskDetails(form:FormData){return execute(form,'save',Object.fromEntries(DETAIL_FIELDS.filter(f=>form.has(f.key)).map(f=>[f.key,read(form,f.key)])));}
export async function addTaskAsset(form:FormData){return execute(form,'link',{ipo_role:read(form,'ipoRole'),link_type:read(form,'linkType'),label:read(form,'label'),url:read(form,'url')||null,notes:read(form,'notes')||null,employee_id:read(form,'employeeId')||null,report_id:read(form,'reportId')||null});}
export async function addTaskRelation(form:FormData){return execute(form,'relation',{other_task_id:read(form,'otherTaskId'),relation_type:read(form,'relationType'),notes:read(form,'notes')||null});}
export async function renameNativeLink(form:FormData){return execute(form,'rename_link',{id:read(form,'linkId'),label:read(form,'label')});}
export async function publishNativeTemplate(form:FormData):Promise<ActionResponse<Json>> {
 const profile=await getCurrentProfile();if(!profile?.isActive)return {success:false,error:'Active authentication required.'};
 let nodes:Json;try {nodes=JSON.parse(read(form,'checklistNodes')||'[]');}catch{return {success:false,error:'Checklist nodes must be valid JSON.'};}
 const db=await createClient();const {data,error}=await db.rpc('publish_task_detail_template',{p_template:read(form,'templateId')||null,p_name:read(form,'templateName'),p_expected_version:Number(read(form,'templateVersion')||0),p_operation:read(form,'operationId'),p_payload:{instructions:Object.fromEntries(DETAIL_FIELDS.map(f=>[f.key,read(form,'instruction_'+f.key)])),checklist_nodes:nodes}});
 if(error)return {success:false,error:error.message};revalidatePath('/task-tools');revalidatePath('/tasks');return {success:true,data};
}
