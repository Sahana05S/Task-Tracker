'use server';
import { getCurrentProfile } from '@/shared/session/profile';
import type { ActionResponse } from '@/types/tracker';
import type { Json } from '@/types/database';
import { DRIVE_INTEGRATION_DEFERRED,DRIVE_UNAVAILABLE_MESSAGE } from './internal/availability';
import { parseDriveOperation } from './internal/input';
import { queueDriveCommand } from './internal/commands';
import { revalidateDriveViews } from './internal/cache';

// PUBLIC server actions. Provider operations stay unavailable while the user's Drive deferral holds.
export async function requestDriveOperation(form:FormData):Promise<ActionResponse<Json>>{
 if(DRIVE_INTEGRATION_DEFERRED)return {success:false,error:DRIVE_UNAVAILABLE_MESSAGE};
 const profile=await getCurrentProfile();if(!profile?.isActive)return {success:false,error:'Active authentication required.'};
 const input=parseDriveOperation(form);if(!input.ok)return {success:false,error:input.error};
 const result=await queueDriveCommand(input.value);
 if(result.success)revalidateDriveViews();
 return result;
}
