import { describe,it,expect,vi } from 'vitest';
import { runDriveJobs } from '@/lib/integrations/drive/jobs';
import { DRIVE_MIME,DriveFailure,type DriveJob,type DrivePolicy,type RemoteFile,type StepState } from '@/lib/integrations/drive/contract';
import type { DriveProvider } from '@/lib/integrations/drive/provider';
const p:DrivePolicy={id:'fixture',sandbox:true,accountScope:'fixture',auth:'organization_oauth',scope:'drive.file',organizationEmail:'worker@example.test',rootId:'fixture_root',sharedDriveId:null,employeeName:'[Employee ID]',taskName:'[Task Tag]',roleFolders:{input:['Input'],process:['Process'],output:['Output']},templates:{},initializeTemplates:[],blankKinds:['document'],autoInitialize:false,checklistAuthority:'native',reviewerSharing:'none',reviewerEmails:{}};
function setup(){
 const job={id:'job',leaseToken:'lease',taskId:'task',policy:p,command:'blank',request:{},steps:[{key:'task:task/file',owner:'task',kind:'create',name:'Report',mimeType:DRIVE_MIME.document,parent:p.rootId}]} as DriveJob;
 const states=new Map<string,StepState>(),files=new Map<string,RemoteFile>();let creates=0,failNext=false,failedLocal=false,revoked=false;
 const provider={principal:async()=>p.organizationEmail,get:async(id:string)=>{if(id===p.rootId)return {id,name:'root',mimeType:DRIVE_MIME.folder,capabilities:{canAddChildren:true}};const file=files.get(id);if(!file)throw new DriveFailure('template_missing');return file;},find:async(marker:string)=>[...files.values()].filter(f=>f.appProperties?.taskpulse===marker),create:async(body:unknown)=>{if(failNext){failNext=false;throw new DriveFailure('quota_limited');}const file={...body as RemoteFile,id:'file-'+(++creates)};files.set(file.id,file);return file;},permissions:async()=>[],share:async()=>{throw new DriveFailure('access_denied');}} as unknown as DriveProvider;
 const db={rpc:vi.fn(async(name:string,args:Record<string,unknown>)=>{
  if(name==='claim_drive_jobs')return {data:[{id:job.id,leaseToken:job.leaseToken}],error:null};
  if(name==='drive_job_context')return revoked?{data:null,error:{message:'Active requesting manager required'}}:{data:job,error:null};
  if(name==='drive_asset_checkpoint'){
   const key=String(args.p_key);if(args.p_state){const next=args.p_state as StepState;states.set(key,structuredClone(next));if(next.externalId&&!next.verified&&failedLocal){failedLocal=false;return {data:null,error:{message:'Response lost'}};}return {data:next,error:null};}
   return {data:structuredClone(states.get(key)??{externalId:null,reservedId:null,dispatched:false,verified:null}),error:null};
  }return {data:null,error:null};
 })};
 return {job,db,provider,states,files,creates:()=>creates,fail:()=>{failNext=true;},loseLocal:()=>{failedLocal=true;},revoke:()=>{revoked=true;}};
}
describe('M10 durable worker partial results',()=>{
 it('publishes no invented URL when verified Google metadata has none',async()=>{const f=setup();expect(await runDriveJobs(f.db as never,()=>f.provider)).toEqual([{id:'job',status:'complete'}]);expect(f.states.get('task:task/file')?.verified?.webViewLink).toBeUndefined();});
 it('replays remote success with a lost local response using the retained external ID',async()=>{const f=setup();f.loseLocal();expect((await runDriveJobs(f.db as never,()=>f.provider))[0].errorCode).toBe('provider_unavailable');await runDriveJobs(f.db as never,()=>f.provider);expect(f.creates()).toBe(1);});
 it('resumes a partial file manifest without recreating earlier verified files',async()=>{
  const f=setup();await runDriveJobs(f.db as never,()=>f.provider);
  f.job.steps!.push({...f.job.steps![0],key:'task:task/second',name:'Second'});f.fail();
  expect((await runDriveJobs(f.db as never,()=>f.provider))[0].errorCode).toBe('quota_limited');expect(f.creates()).toBe(1);
  expect((await runDriveJobs(f.db as never,()=>f.provider))[0].status).toBe('complete');expect(f.creates()).toBe(2);
 });
 it('retains the created file when reviewer sharing fails',async()=>{
  const f=setup();f.job.steps!.push({key:'task:task/file/reviewer',owner:'task',kind:'permission',name:'Report',mimeType:DRIVE_MIME.document,parentKey:'task:task/file',email:'r@example.test'});
  expect((await runDriveJobs(f.db as never,()=>f.provider))[0].errorCode).toBe('sharing_failed');expect(f.states.get('task:task/file')?.verified?.id).toBe('file-1');expect(f.creates()).toBe(1);
 });
 it('never dispatches after the requesting manager loses authorization',async()=>{const f=setup();f.revoke();expect((await runDriveJobs(f.db as never,()=>f.provider))[0].errorCode).toBe('configuration_changed');expect(f.creates()).toBe(0);});
});
