'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentProfile } from '@/lib/auth/profile';
import { createClient } from '@/lib/supabase/server';
import { normalizeTaskTagParam } from '@/lib/tasks/detail';
import { commandIdentity, executionError, executionResult, type ExecutionResult } from '@/lib/commands/result';
import { createTaskLog } from '@/app/logs/actions';
import type { ActionResponse } from '@/types/tracker';
export type TimerActionState=ActionResponse<ExecutionResult>;
function text(form: FormData,key: string) { return String(form.get(key)??'').trim(); }
async function timerCommand(form: FormData,command: 'start'|'stop'|'discard'): Promise<TimerActionState> {
 const actor=await getCurrentProfile(); if (!actor?.isActive) return {success:false,error:'Active sign-in required.',errorCode:'forbidden'};
 if (command!=='start' && text(form,'timerId').includes(':')) {
  const [id,version]=text(form,'timerId').split(':'); form.set('timerId',id); form.set('expectedVersion',version);
 }
 const identity=commandIdentity(form);
 if (!identity.operationId || (command!=='start' && identity.version===null)) return {success:false,error:'Missing operation key/version. Reload the form.',errorCode:'validation'};
 const supabase=await createClient();
 const payload={notes:text(form,'notes')||null,reason:text(form,'reason')||null};
 if (command==='start') {
  const tag=normalizeTaskTagParam(text(form,'taskTag'));
  const task=await supabase.from('tasks').select('id').eq('task_tag',tag ?? '').maybeSingle();
  if (task.error) return executionError(task.error);
  if (!task.data) return {success:false,error:'Task no longer exists.',errorCode:'validation'};
  const result=await supabase.rpc('start_task_timer',{p_task_id:task.data.id,p_payload:payload,p_operation_id:identity.operationId});
  if (result.error) return executionError(result.error);
  return committed(executionResult(result.data));
 }
 const args={p_timer_id:text(form,'timerId'),p_payload:payload,p_operation_id:identity.operationId,p_expected_version:identity.version!};
 const result=command==='stop' ? await supabase.rpc('stop_task_timer',args) : await supabase.rpc('discard_task_timer',args);
 if (result.error) return executionError(result.error);
 return committed(executionResult(result.data));
}
function committed(data: ExecutionResult): TimerActionState {
 for (const path of [`/tasks/${encodeURIComponent(data.taskTag)}`,'/tasks','/logs','/dashboard','/team','/task-tools','/reports']) revalidatePath(path);
 revalidatePath('/team/[employeeId]','page');
 revalidatePath('/tasks/[taskTag]/checklist','page'); revalidatePath('/tasks/[taskTag]/checklist/[nodeId]','page');
 return {success:true,data};
}
export async function startTaskTimer(form: FormData) { return timerCommand(form,'start'); }
/** Ordinary task timer tagged with a checklist item (migration 34); its stop logs count as task hours. */
export async function startItemTimer(form: FormData): Promise<TimerActionState> {
 const actor=await getCurrentProfile(); if (!actor?.isActive) return {success:false,error:'Active sign-in required.',errorCode:'forbidden'};
 const identity=commandIdentity(form);
 if (!identity.operationId) return {success:false,error:'Missing operation key. Reload the form.',errorCode:'validation'};
 const supabase=await createClient();
 const result=await supabase.rpc('start_checklist_item_timer',{p_node_id:text(form,'nodeId'),p_payload:{notes:text(form,'notes')||null},p_operation_id:identity.operationId});
 if (result.error) return executionError(result.error);
 return committed(executionResult(result.data));
}
export async function stopTaskTimer(form: FormData) { return timerCommand(form,'stop'); }
export async function discardTaskTimer(form: FormData) { return timerCommand(form,'discard'); }
export async function discardTimerAsManager(form: FormData) { return timerCommand(form,'discard'); }
export async function enterManualTaskTime(form: FormData): Promise<TimerActionState> {
 const supabase=await createClient();
 const task=await supabase.from('tasks').select('id').eq('task_tag',normalizeTaskTagParam(text(form,'taskTag')) ?? '').maybeSingle();
 if (task.error) return executionError(task.error);
 if (!task.data) return {success:false,error:'Task no longer exists.',errorCode:'validation'};
 form.set('taskId',task.data.id); form.set('updateNotes',text(form,'notes'));
 return createTaskLog(null,form);
}
