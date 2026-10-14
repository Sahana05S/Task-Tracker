import { DRIVE_MIME,DriveFailure,substituteName,type DriveJob,type DriveStep } from './contract';
import type { DriveProvider } from './provider';

export async function buildPlan(job:DriveJob,provider:DriveProvider):Promise<DriveStep[]>{
 const {policy:p}=job,steps:DriveStep[]=[];
 if(typeof job.employeeId!=='string'||!job.employeeId.trim())throw new DriveFailure('configuration_missing');
 const values={taskTag:job.taskTag,taskTitle:job.taskTitle,employeeId:job.employeeId};
 const name=(s:string)=>substituteName(s,values),taskKey='task:'+job.taskId;
 if(job.command==='rename'){
  if(!job.asset)throw new DriveFailure('identity_mismatch');
  return [{key:String(job.request.assetKey),owner:job.taskId,kind:'rename',name:String(job.request.name),mimeType:job.asset.mimeType,assetId:job.asset.id,parent:job.asset.parents?.[0],ipoRole:'reference'}];
 }
 if(job.command==='verify_link')throw new DriveFailure('unsupported_type');
 const employeeKey='employee:'+job.employeeUserId;
 steps.push({key:employeeKey,owner:job.employeeUserId,kind:'folder',name:name(p.employeeName),mimeType:DRIVE_MIME.folder,parent:p.rootId});
 steps.push({key:taskKey,owner:job.taskId,kind:'folder',name:name(p.taskName),mimeType:DRIVE_MIME.folder,parentKey:employeeKey,ipoRole:'reference'});
 const roleKeys:Record<string,string>={};
 for(const role of ['input','process','output'] as const){
  let parent=taskKey;
  for(const part of p.roleFolders[role]){const key=parent+'/path:'+part; if(!steps.some(s=>s.key===key))steps.push({key,owner:job.taskId,kind:'folder',name:name(part),mimeType:DRIVE_MIME.folder,parentKey:parent,ipoRole:role});parent=key;}
  roleKeys[role]=parent;
 }
 const copyTree=async(id:string,version:string,parentKey:string,key:string,depth=0)=>{
  if(depth>12||steps.length>300)throw new DriveFailure('unsupported_type');
  const file=await provider.get(id);if(file.trashed||file.version!==version)throw new DriveFailure('template_changed');
  if(file.mimeType===DRIVE_MIME.shortcut)throw new DriveFailure('unsupported_type');
  steps.push({key,owner:job.taskId,kind:file.mimeType===DRIVE_MIME.folder?'folder':'copy',name:name(file.name),mimeType:file.mimeType,parentKey,sourceId:file.mimeType===DRIVE_MIME.folder?undefined:id,sourceVersion:version,templateVersion:version});
  if(file.mimeType===DRIVE_MIME.folder){for(const child of await provider.children(id)){if(!child.version)throw new DriveFailure('template_changed');await copyTree(child.id,child.version,key,key+'/'+child.id,depth+1);}if((await provider.get(id)).version!==version)throw new DriveFailure('template_changed');}
 };
 if(job.command==='initialize')for(const key of p.initializeTemplates){const t=p.templates[key];if((await provider.get(t.id)).mimeType!==t.mimeType)throw new DriveFailure('template_changed');await copyTree(t.id,t.version,roleKeys[t.role],taskKey+'/template:'+key);}
 if(job.command==='copy_template'){
  const t=p.templates[String(job.request.templateKey)];if(!t)throw new DriveFailure('template_missing');
  if((await provider.get(t.id)).mimeType!==t.mimeType)throw new DriveFailure('template_changed');
  await copyTree(t.id,t.version,roleKeys[t.role],taskKey+'/operation:'+job.id);
 }
 if(job.command==='blank'){
  const kind=String(job.request.fileKind) as keyof typeof DRIVE_MIME,role=String(job.request.ipoRole);
  if(!p.blankKinds.includes(kind as 'document')||!roleKeys[role])throw new DriveFailure('unsupported_type');
  const template=Object.values(p.templates).find(t=>t.blankKind===kind);
  if(kind==='drawing'||kind==='form'){if(!template)throw new DriveFailure('unsupported_type');await copyTree(template.id,template.version,roleKeys[role],taskKey+'/operation:'+job.id);steps[steps.length-1].name=name(String(job.request.name));}
  else steps.push({key:taskKey+'/operation:'+job.id,owner:job.taskId,kind:'create',name:name(String(job.request.name)),mimeType:DRIVE_MIME[kind],parentKey:roleKeys[role],ipoRole:role as 'input'});
 }
 if(job.command==='carryover_shortcut'){
  if(!job.predecessorAsset||job.predecessorAsset.mimeType!==DRIVE_MIME.folder)throw new DriveFailure('predecessor_asset_missing');
  const target=await provider.get(job.predecessorAsset.id);if(target.trashed||target.mimeType!==DRIVE_MIME.folder)throw new DriveFailure('predecessor_asset_missing');
  steps.push({key:taskKey+'/predecessor:'+target.id,owner:job.taskId,kind:'shortcut',name:'Previous work '+job.taskTag,mimeType:DRIVE_MIME.shortcut,parentKey:taskKey,targetId:target.id,ipoRole:'reference'});
 }
 if(p.reviewerSharing==='commenter_files')for(const asset of [...steps].filter(s=>s.kind==='copy'||s.kind==='create'))for(const uid of job.reviewerIds){const email=p.reviewerEmails[uid];steps.push({key:asset.key+'/reviewer:'+uid,owner:job.taskId,kind:'permission',name:asset.name,mimeType:asset.mimeType,parentKey:asset.key,email,role:'commenter'});}
 return steps;
}
