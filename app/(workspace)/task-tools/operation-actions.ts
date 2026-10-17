'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentProfile } from '@/shared/session/profile';
import { createClient } from '@/shared/supabase/server';
import { parsePreview, type ToolsPreview } from '@/lib/task-tools/contract';
import type { Json } from '@/types/database';

type Reply<T> = { success:true; data:T } | { success:false; error:string };
export async function previewTaskTool(command:string,payload:Record<string,Json|undefined>):Promise<Reply<ToolsPreview>> {
  const actor=await getCurrentProfile();
  if(!actor?.isActive)return {success:false,error:'An active signed-in account is required.'};
  const client=await createClient();
  const {data,error}=await client.rpc('task_tools_preview',{p_command:command,p_payload:payload});
  if(error)return {success:false,error:error.message};
  try{return {success:true,data:parsePreview(data)};}catch(e){return {success:false,error:e instanceof Error?e.message:'Preview unavailable.'};}
}
export async function commitTaskTool(previewId:string,operationId:string):Promise<Reply<{items:{taskId:string;taskTag:string;status:string}[]}>> {
  const actor=await getCurrentProfile();
  if(!actor?.isActive)return {success:false,error:'An active signed-in account is required.'};
  const client=await createClient();
  const {data,error}=await client.rpc('task_tools_command',{p_preview:previewId,p_operation:operationId});
  if(error)return {success:false,error:error.code==='40001'?`Preview conflict: ${error.message}`:error.message};
  if(!data||typeof data!=='object'||Array.isArray(data)||!Array.isArray(data.items))return {success:false,error:'Command result unavailable. Retry with the same operation.'};
  for(const path of ['/task-tools','/tasks','/dashboard','/team','/support','/reports'])revalidatePath(path);
  return {success:true,data:data as {items:{taskId:string;taskTag:string;status:string}[]}};
}
