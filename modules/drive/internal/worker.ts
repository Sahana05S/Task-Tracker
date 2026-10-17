// PRIVATE. Internal worker endpoint: token check, read-only setup diagnostics and job runs.
import { createHash,timingSafeEqual } from 'node:crypto';
import { runDriveJobs } from './jobs';
import { GoogleDrive } from './provider';
import { googleToken } from './auth';
import { assertApprovedSandboxPolicy } from './approved-sandbox';
import { verifyApprovedSandboxAccess } from './setup';
import { DriveFailure } from './contract';
import { DRIVE_INTEGRATION_DEFERRED,DRIVE_UNAVAILABLE_MESSAGE } from './availability';
import { workerClient } from '@/shared/supabase/worker';
function authorize(request:Request,mutating:boolean):Response|null{
 if(DRIVE_INTEGRATION_DEFERRED)return Response.json({status:'unavailable',reason:DRIVE_UNAVAILABLE_MESSAGE},{status:503});
 const token=process.env.TASKPULSE_DRIVE_WORKER_TOKEN;
 if(!token||mutating&&process.env.TASKPULSE_DRIVE_WORKER_ENABLED!=='sandbox')return Response.json({status:'unavailable',reason:'Drive sandbox worker is disabled.'},{status:503});
 const digest=(value:string)=>createHash('sha256').update(value).digest();
 if(!timingSafeEqual(digest(request.headers.get('authorization')??''),digest('Bearer '+token)))return Response.json({status:'forbidden'},{status:403});
 return null;
}
export async function handleDriveSetupCheck(request:Request){
 const denied=authorize(request,false);if(denied)return denied;
 try{return Response.json(await verifyApprovedSandboxAccess());}
 catch(error){return Response.json({status:'blocked',errorCode:error instanceof DriveFailure?error.code:'provider_unavailable'},{status:503});}
}
export async function handleDriveWorkerRun(request:Request){
 const denied=authorize(request,true);if(denied)return denied;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return Response.json({status:'unavailable',reason:'Worker database configuration is missing.'},{status:503});
 const db=workerClient(url,key);
 try{return Response.json({outcomes:await runDriveJobs(db,job=>{assertApprovedSandboxPolicy(job.policy);return new GoogleDrive(googleToken(job.policy));},1,org=>workerClient(url,key,org))});}
 catch{return Response.json({status:'failed',reason:'Inspect retained Drive jobs.'},{status:503});}
}
