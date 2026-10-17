'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentProfile } from '@/shared/session/profile';
import { createClient } from '@/shared/supabase/server';
import type { Json } from '@/types/database';
import type { ActionResponse } from '@/types/tracker';
const read=(f:FormData,k:string)=>String(f.get(k)??'').trim();
export async function checklistCommand(form:FormData):Promise<ActionResponse<Json>> {
 const profile=await getCurrentProfile(); if(!profile?.isActive) return {success:false,error:'Active authentication required.'};
 const command=read(form,'command'); const payload:Record<string,Json>={};
 const fields:Record<string,string[]>={create:['title'],add:['title','description','section','parent_id','linked_task_id','node_type'],state:['node_id','state'],edit:['node_id','title','section','parent_id','linked_task_id','node_type','reason'],map:['node_id','section','reason'],delete:['node_id','reason'],duplicate:['node_id'],section:['section','intentional_empty','reason'],mode:['enabled','reason','preview_progress']};
 if(!fields[command]) return {success:false,error:'Unknown checklist action.'};
 for(const key of fields[command]) {const value=read(form,key);payload[key]=key==='enabled'||key==='intentional_empty'?value==='true':key==='preview_progress'?(value||null):value||null;}
 // Optional row details (migration 33): sent only when the form has the field, so
 // an edit without them keeps the stored links and estimate.
 if((command==='add'||command==='edit')&&form.has('links')) payload.links=read(form,'links').split(/\s+/).filter(Boolean);
 if((command==='add'||command==='edit')&&form.has('estimated_minutes')) {const minutes=read(form,'estimated_minutes');if(minutes&&!/^\d+$/.test(minutes))return {success:false,error:'Estimated time must be whole minutes.'};payload.estimated_minutes=minutes?Number(minutes):null;}
 const version=read(form,'expectedVersion');if(!/^\d+$/.test(version))return {success:false,error:'Reload the checklist before saving.'};
 const db=await createClient(); const {data,error}=await db.rpc('checklist_command',{p_task:read(form,'taskId'),p_command:command,p_payload:payload,p_expected_version:Number(version),p_operation:read(form,'operationId')});
 if(error)return {success:false,error:error.message};
 revalidatePath('/tasks');revalidatePath('/task-tools');revalidatePath('/tasks/[taskTag]','page');revalidatePath('/tasks/[taskTag]/checklist','page');revalidatePath('/tasks/[taskTag]/checklist/[nodeId]','page');revalidatePath('/dashboard');revalidatePath('/team');
 return {success:true,data};
}
