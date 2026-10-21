// PRIVATE. Queues a Drive job through the drive_command RPC (permissions enforced in PostgreSQL).
import { createClient } from '@/shared/supabase/server';
import type { ActionResponse } from '@/types/tracker';
import type { Json } from '@/types/database';
import type { DriveOperationInput } from './input';
import { isConflictCode } from '@/shared/commands/conflict';

export async function queueDriveCommand(input:DriveOperationInput):Promise<ActionResponse<Json>>{
 const db=await createClient();const {data,error}=await db.rpc('drive_command',{p_task:input.taskId,p_command:input.command,p_payload:input.payload,p_expected_version:input.expectedVersion,p_operation:input.operationId});
 if(error)return {success:false,error:isConflictCode(error.code)?'Task changed. Reload and review the current task.':error.message};
 return {success:true,data};
}
