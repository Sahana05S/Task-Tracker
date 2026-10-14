import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database,Json } from '@/types/database';
import { DriveFailure,validatePolicy,type DriveJob,type FailureCode,type StepState } from './contract';
import { executeStep,shareReviewer,type DriveProvider } from './provider';
import { buildPlan } from './plan';

const json=(value:unknown)=>value as Json;
function databaseFailure(message:string):DriveFailure {
 if(message.includes('configuration missing'))return new DriveFailure('configuration_missing');
 if(message.includes('archived'))return new DriveFailure('task_archived');
 if(message.includes('resource busy'))return new DriveFailure('resource_busy');
 if(message.includes('configuration')||message.includes('context changed')||message.includes('requesting manager'))return new DriveFailure('configuration_changed');
 return new DriveFailure('provider_unavailable');
}
export async function runDriveJobs(db:SupabaseClient<Database>,factory:(job:DriveJob)=>DriveProvider,limit=1){
 const claim=await db.rpc('claim_drive_jobs',{p_limit:limit});if(claim.error)throw databaseFailure(claim.error.message);
 const outcomes:{id:string;status:string;errorCode?:FailureCode}[]=[];
 for(const lease of (claim.data??[]) as unknown as {id:string;leaseToken:string}[]){
  const args={p_job:lease.id,p_lease:lease.leaseToken};
  try{
   const context=await db.rpc('drive_job_context',args);if(context.error)throw databaseFailure(context.error.message);
   const job=context.data as unknown as DriveJob;job.policy=validatePolicy(job.policy);
   const provider=factory(job);
   if((await provider.principal()).toLowerCase()!==job.policy.organizationEmail.toLowerCase())throw new DriveFailure('configuration_changed');
   let root;try{root=await provider.get(job.policy.rootId);}catch(e){if(e instanceof DriveFailure&&e.code==='template_missing')throw new DriveFailure('root_unavailable');throw e;}
   if(root.trashed||root.mimeType!=='application/vnd.google-apps.folder'||root.capabilities?.canAddChildren!==true||job.policy.sharedDriveId&&root.driveId!==job.policy.sharedDriveId)throw new DriveFailure('root_unavailable');
   if(!job.steps){job.steps=await buildPlan(job,provider);const saved=await db.rpc('drive_job_plan',{...args,p_steps:json(job.steps)});if(saved.error)throw databaseFailure(saved.error.message);}
   const checkpoint=async(key:string,state?:StepState):Promise<StepState>=>{
    const saved=await db.rpc('drive_asset_checkpoint',{...args,p_key:key,p_state:state?json(state):null});if(saved.error)throw databaseFailure(saved.error.message);return saved.data as unknown as StepState;
   };
   for(const step of job.steps){
    let state=await checkpoint(step.key);
    const parent=step.parent??(step.parentKey?(await checkpoint(step.parentKey)).verified?.id:undefined);
    if(step.parentKey&&!parent)throw new DriveFailure('identity_mismatch');
    if(step.kind==='permission'){
     if(!step.email)throw new DriveFailure('sharing_failed');
     try{await shareReviewer(provider,parent!,step.email!,state.dispatched,async()=>{state={...state,dispatched:true};await checkpoint(step.key,state);},job.policy.rootId);}
     catch(e){if(e instanceof DriveFailure&&!e.uncertain&&e.code==='sharing_failed')await checkpoint(step.key,{...state,dispatched:false});throw e;}
     const file=await provider.get(parent!);await checkpoint(step.key,{...state,externalId:file.id,verified:file});
    }else{
     if(step.kind==='rename')state={...state,externalId:job.asset!.id};
     const file=await executeStep(provider,job.policy,step,state,parent,next=>checkpoint(step.key,next).then(()=>undefined));
     await checkpoint(step.key,{...(await checkpoint(step.key)),externalId:file.id,verified:file});
    }
   }
   const done=await db.rpc('finish_drive_job',{...args,p_error:null});if(done.error)throw databaseFailure(done.error.message);
   outcomes.push({id:job.id,status:'complete'});
  }catch(e){
   const code=e instanceof DriveFailure?e.code:'provider_unavailable';
   const finished=await db.rpc('finish_drive_job',{...args,p_error:code});
   outcomes.push({id:lease.id,status:finished.error?'lease_lost':'blocked',errorCode:code});
  }
 }
 return outcomes;
}
