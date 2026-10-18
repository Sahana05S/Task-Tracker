import { createHash } from 'node:crypto';
import { DRIVE_MIME,DriveFailure,type DrivePolicy,type DriveStep,type RemoteFile,type RemotePermission,type StepState } from './contract';

const fields='id,name,mimeType,parents,driveId,webViewLink,trashed,version,appProperties,shortcutDetails,capabilities';
export interface DriveProvider {
 get(id:string):Promise<RemoteFile>; children(id:string):Promise<RemoteFile[]>;
 find(marker:string):Promise<RemoteFile[]>; reserve():Promise<string>;
 create(body:Record<string,unknown>):Promise<RemoteFile>; copy(id:string,body:Record<string,unknown>):Promise<RemoteFile>;
 rename(id:string,name:string):Promise<RemoteFile>; permissions(id:string):Promise<RemotePermission[]>;
 share(id:string,email:string):Promise<void>; principal():Promise<string>;
}
export class GoogleDrive implements DriveProvider {
 constructor(private readonly token:()=>Promise<string>,private readonly fetcher:typeof fetch=fetch){}
 private async call<T>(path:string,method='GET',body?:unknown):Promise<T>{
  let response:Response;
  const token=await this.token();
  try {response=await this.fetcher('https://www.googleapis.com/drive/v3/'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)});}
  catch {throw new DriveFailure(method==='GET'?'provider_unavailable':'remote_uncertain',method!=='GET');}
  if(!response.ok){
   let reason='';try {const error=await response.json();reason=error?.error?.errors?.[0]?.reason??'';}catch{}
   if(response.status===401)throw new DriveFailure('credentials_revoked');
   if(response.status===429||['rateLimitExceeded','userRateLimitExceeded','storageQuotaExceeded','dailyLimitExceeded'].includes(reason))throw new DriveFailure('quota_limited');
   if(response.status===403)throw new DriveFailure('access_denied');
   if(response.status===404)throw new DriveFailure('template_missing');
   if(response.status===409)throw new DriveFailure('identity_mismatch');
   throw new DriveFailure(method==='GET'?'provider_unavailable':'remote_uncertain',method!=='GET');
  }
  try {return await response.json() as T;}catch {throw new DriveFailure(method==='GET'?'provider_unavailable':'remote_uncertain',method!=='GET');}
 }
 get(id:string){return this.call<RemoteFile>('files/'+encodeURIComponent(id)+'?supportsAllDrives=true&fields='+fields);}
 private async list(q:string){
  const result:RemoteFile[]=[];let page:string|undefined;
  do {const params=new URLSearchParams({q,spaces:'drive',includeItemsFromAllDrives:'true',supportsAllDrives:'true',pageSize:'100',fields:'nextPageToken,files('+fields+')'});if(page)params.set('pageToken',page);
   const data=await this.call<{files:RemoteFile[];nextPageToken?:string}>('files?'+params);result.push(...data.files);page=data.nextPageToken;
   if(result.length>1000)throw new DriveFailure('unsupported_type');
  }while(page);return result;
 }
 children(id:string){return this.list("'"+id.replaceAll("'","\\'")+"' in parents and trashed = false");}
 find(marker:string){return this.list("appProperties has { key='taskpulse' and value='"+marker+"' } and trashed = false");}
 async reserve(){return (await this.call<{ids:string[]}>('files/generateIds?count=1&space=drive&type=files')).ids[0];}
 create(body:Record<string,unknown>){return this.call<RemoteFile>('files?supportsAllDrives=true&ignoreDefaultVisibility=true&fields='+fields,'POST',body);}
 copy(id:string,body:Record<string,unknown>){return this.call<RemoteFile>('files/'+encodeURIComponent(id)+'/copy?supportsAllDrives=true&copyComments=false&ignoreDefaultVisibility=true&fields='+fields,'POST',body);}
 rename(id:string,name:string){return this.call<RemoteFile>('files/'+encodeURIComponent(id)+'?supportsAllDrives=true&fields='+fields,'PATCH',{name});}
 async permissions(id:string){
  const result:RemotePermission[]=[];let page:string|undefined;
  do {const params=new URLSearchParams({supportsAllDrives:'true',pageSize:'100',fields:'nextPageToken,permissions(id,type,role,emailAddress,permissionDetails)'});if(page)params.set('pageToken',page);
   const data=await this.call<{permissions:RemotePermission[];nextPageToken?:string}>('files/'+encodeURIComponent(id)+'/permissions?'+params);result.push(...data.permissions);page=data.nextPageToken;
  }while(page);return result;
 }
 async share(id:string,email:string){await this.call('files/'+encodeURIComponent(id)+'/permissions?supportsAllDrives=true&sendNotificationEmail=false&fields=id','POST',{type:'user',role:'commenter',emailAddress:email});}
 async principal(){return (await this.call<{user:{emailAddress:string}}>('about?fields=user(emailAddress)')).user.emailAddress;}
}
export const markerFor=(policy:DrivePolicy,key:string)=>createHash('sha256').update(policy.accountScope+'|'+key).digest('hex');
/** Read the live parent chain before each mutation. Persisted parents alone do
 * not prove scope after a user moves an ancestor out of the sandbox. */
export async function assertUnderRoot(provider:DriveProvider,id:string,rootId:string):Promise<void>{
 const visited=new Set<string>();let current=id;
 for(let depth=0;depth<40;depth++){
  if(current===rootId)return;
  if(visited.has(current))throw new DriveFailure('identity_mismatch');visited.add(current);
  const file=await provider.get(current);
  if(file.trashed||!file.parents||file.parents.length!==1)throw new DriveFailure('identity_mismatch');
  current=file.parents[0];
 }
 throw new DriveFailure('identity_mismatch');
}
export function verify(file:RemoteFile,step:DriveStep,marker:string,parent?:string){
 if(file.trashed||file.appProperties?.taskpulse!==marker||file.mimeType!==step.mimeType||(parent&&!file.parents?.includes(parent))||(step.kind!=='rename'&&file.name!==step.name)||(step.kind==='shortcut'&&file.shortcutDetails?.targetId!==step.targetId))throw new DriveFailure('identity_mismatch');
}
/** Persist dispatch intent BEFORE mutating Google. A lost native-file response is
 * reconciled by its atomic appProperties marker; absence never authorizes a
 * second POST. Folders also have preallocated identities safe for replay. */
export async function executeStep(provider:DriveProvider,policy:DrivePolicy,step:DriveStep,state:StepState,parent:string|undefined,persist:(state:StepState)=>Promise<void>):Promise<RemoteFile>{
 const marker=markerFor(policy,step.key);
 if(step.kind==='rename'){
  if(!state.externalId)throw new DriveFailure('identity_mismatch');
  const current=await provider.get(state.externalId);verify(current,{...step,kind:'rename'},marker,parent);
  await assertUnderRoot(provider,current.id,policy.rootId);
  if(current.name!==step.name)await provider.rename(current.id,step.name);
  const renamed=await provider.get(current.id);verify(renamed,{...step,kind:'folder'},marker,parent);return renamed;
 }
 if(!parent)throw new DriveFailure('identity_mismatch');
 await assertUnderRoot(provider,parent,policy.rootId);
 if(step.kind==='shortcut'){
  if(!step.targetId)throw new DriveFailure('predecessor_asset_missing');
  await assertUnderRoot(provider,step.targetId,policy.rootId);
 }
 if(step.sourceId){const source=await provider.get(step.sourceId);if(source.version!==step.sourceVersion||source.mimeType!==step.mimeType||source.trashed)throw new DriveFailure('template_changed');}
 if(state.externalId||state.verified){const file=await provider.get(state.externalId??state.verified!.id);verify(file,step,marker,parent);return file;}
 const matches=await provider.find(marker);if(matches.length>1)throw new DriveFailure('identity_mismatch');
 if(matches.length){const file=await provider.get(matches[0].id);verify(file,step,marker,parent);return file;}
 if(state.reservedId){try{const existing=await provider.get(state.reservedId);verify(existing,step,marker,parent);return existing;}catch(e){if(!(e instanceof DriveFailure)||e.code!=='template_missing')throw e;}}
 if(state.dispatched&&!state.reservedId)throw new DriveFailure('remote_uncertain',true);
 if(step.kind==='folder'&&!state.reservedId){state={...state,reservedId:await provider.reserve()};await persist(state);}
 state={...state,dispatched:true};await persist(state);
 const body:Record<string,unknown>={name:step.name,mimeType:step.mimeType,parents:[parent],appProperties:{taskpulse:marker,policy:policy.id,...(step.sourceVersion?{templateVersion:step.sourceVersion}:{})}};
 if(state.reservedId)body.id=state.reservedId;
 if(step.kind==='shortcut')body.shortcutDetails={targetId:step.targetId};
 try {const file=step.kind==='copy'?await provider.copy(step.sourceId!,body):await provider.create(body);state={...state,externalId:file.id};await persist(state);}
 catch(e){if(e instanceof DriveFailure&&!e.uncertain&&e.code!=='identity_mismatch'){await persist({...state,dispatched:false});}throw e;}
 const file=await provider.get(state.externalId!);verify(file,step,marker,parent);
 if(step.sourceId&&(await provider.get(step.sourceId)).version!==step.sourceVersion)throw new DriveFailure('template_changed');
 return file;
}
export async function shareReviewer(provider:DriveProvider,id:string,email:string,dispatched:boolean,dispatch:()=>Promise<void>,rootId:string){
 await assertUnderRoot(provider,id,rootId);
 const found=(await provider.permissions(id)).filter(p=>p.type==='user'&&p.emailAddress?.toLowerCase()===email.toLowerCase());
 if(found.length){if(found.some(p=>p.role!=='commenter'))throw new DriveFailure('sharing_conflict');return;}
 if(dispatched)throw new DriveFailure('remote_uncertain',true);
 await dispatch();try {await provider.share(id,email);}catch(e){if(e instanceof DriveFailure&&e.uncertain)throw e;throw new DriveFailure('sharing_failed');}
 const checked=(await provider.permissions(id)).filter(p=>p.type==='user'&&p.emailAddress?.toLowerCase()===email.toLowerCase());
 if(checked.length!==1||checked[0].role!=='commenter')throw new DriveFailure('sharing_failed');
}
