import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/types/database';
export interface AwardCommandResponse {date:string;status:string;runId?:string;winnerId?:string|null;version:number;jobId?:string}
export async function storeDailyStarCalculation({starDate,operationId,overrideUserId,overrideReason,runId,expectedVersion}:{starDate:string;operationId:string;overrideUserId?:string;overrideReason?:string;runId?:string;expectedVersion?:number}) {
 const db=await createClient();
 const payload:Json=overrideUserId?{date:starDate,userId:overrideUserId,reason:overrideReason??'',runId:runId??'',expectedVersion:expectedVersion??-1}:{date:starDate};
 const result=await db.rpc('award_command',{p_command:overrideUserId?'override':'request',p_payload:payload,p_operation:operationId});
 if(result.error)throw new Error(result.error.message);
 if(!result.data||typeof result.data!=='object'||Array.isArray(result.data)||typeof result.data.status!=='string')throw new Error('Award command response unavailable; retry the same operation.');
 return result.data as unknown as AwardCommandResponse;
}
