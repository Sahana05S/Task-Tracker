export const DRIVE_MIME={folder:'application/vnd.google-apps.folder',document:'application/vnd.google-apps.document',sheet:'application/vnd.google-apps.spreadsheet',slides:'application/vnd.google-apps.presentation',drawing:'application/vnd.google-apps.drawing',form:'application/vnd.google-apps.form',shortcut:'application/vnd.google-apps.shortcut'} as const;
export type FileKind='document'|'sheet'|'slides'|'drawing'|'form';
export type DriveCommand='initialize'|'blank'|'copy_template'|'rename'|'carryover_shortcut'|'verify_link';
export type FailureCode='configuration_missing'|'configuration_changed'|'credentials_missing'|'credentials_revoked'|'access_denied'|'root_unavailable'|'template_missing'|'template_changed'|'quota_limited'|'provider_unavailable'|'remote_uncertain'|'identity_mismatch'|'unsupported_type'|'sharing_failed'|'sharing_conflict'|'predecessor_asset_missing'|'task_archived'|'resource_busy';
export class DriveFailure extends Error {
 constructor(readonly code:FailureCode,readonly uncertain=false){super(code);this.name='DriveFailure';}
}
export interface DriveTemplate {label:string;id:string;version:string;mimeType:string;role:'input'|'process'|'output';blankKind?:'drawing'|'form'}
export interface DrivePolicy {
 id:string;sandbox:true;accountScope:string;auth:'shared_drive_service_account'|'organization_oauth';scope:'drive.file'|'drive';organizationEmail:string;
 rootId:string;sharedDriveId:string|null;employeeName:string;taskName:string;
 roleFolders:Record<'input'|'process'|'output',string[]>;templates:Record<string,DriveTemplate>;initializeTemplates:string[];
 blankKinds:FileKind[];autoInitialize:boolean;checklistAuthority:'native';reviewerSharing:'none'|'commenter_files';reviewerEmails:Record<string,string>;
}
const idPattern=/^[A-Za-z0-9_-]{8,160}$/;
export function validatePolicy(value:unknown):DrivePolicy {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new DriveFailure('configuration_missing');
 const c=value as DrivePolicy;
 const allowed=['id','sandbox','accountScope','auth','scope','organizationEmail','rootId','sharedDriveId','employeeName','taskName','roleFolders','templates','initializeTemplates','blankKinds','autoInitialize','checklistAuthority','reviewerSharing','reviewerEmails'];
 if(Object.keys(c).some(k=>!allowed.includes(k)))throw new DriveFailure('configuration_missing');
 if(typeof c.id!=='string'||!c.id||c.sandbox!==true||!['shared_drive_service_account','organization_oauth'].includes(c.auth)||!['drive.file','drive'].includes(c.scope)||typeof c.accountScope!=='string'||!c.accountScope||!idPattern.test(c.rootId??'')||!/^\S+@\S+\.\S+$/.test(c.organizationEmail??'')||c.checklistAuthority!=='native'||typeof c.autoInitialize!=='boolean'||!['none','commenter_files'].includes(c.reviewerSharing))throw new DriveFailure('configuration_missing');
 if(c.auth==='shared_drive_service_account'&&!idPattern.test(c.sharedDriveId??''))throw new DriveFailure('configuration_missing');
 if(c.auth==='organization_oauth'&&c.sharedDriveId!==null&&!idPattern.test(c.sharedDriveId))throw new DriveFailure('configuration_missing');
 for(const name of [c.employeeName,c.taskName])if(typeof name!=='string'||!name.trim()||name.length>300)throw new DriveFailure('configuration_missing');
 if(c.employeeName.includes('[Task Tag]')||c.employeeName.includes('[Task Title]'))throw new DriveFailure('configuration_missing');
 const paths=Object.values(c.roleFolders??{});
 if(paths.length!==3||['input','process','output'].some(r=>!Array.isArray(c.roleFolders[r as keyof typeof c.roleFolders]))||paths.some(p=>p.length<1||p.length>8||p.some(n=>typeof n!=='string'||!n.trim()||n.length>300)))throw new DriveFailure('configuration_missing');
 if(!Array.isArray(c.blankKinds)||c.blankKinds.some(k=>!['document','sheet','slides','drawing','form'].includes(k))||!Array.isArray(c.initializeTemplates)||!c.templates||typeof c.templates!=='object'||!c.reviewerEmails||typeof c.reviewerEmails!=='object')throw new DriveFailure('configuration_missing');
 for(const [key,t] of Object.entries(c.templates))if(!/^[\w-]{1,80}$/.test(key)||!t||Object.keys(t).some(k=>!['label','id','version','mimeType','role','blankKind'].includes(k))||!idPattern.test(t.id??'')||typeof t.version!=='string'||!/^\d+$/.test(t.version)||typeof t.label!=='string'||!t.label.trim()||!['input','process','output'].includes(t.role)||typeof t.mimeType!=='string'||!t.mimeType||t.blankKind!==undefined&&!['drawing','form'].includes(t.blankKind))throw new DriveFailure('configuration_missing');
 if(c.initializeTemplates.some(k=>!c.templates[k]))throw new DriveFailure('configuration_missing');
 for(const k of c.blankKinds.filter(k=>k==='drawing'||k==='form'))if(Object.values(c.templates).filter(t=>t.blankKind===k&&t.mimeType===DRIVE_MIME[k]).length!==1)throw new DriveFailure('configuration_missing');
 for(const [uid,email] of Object.entries(c.reviewerEmails))if(!/^[0-9a-f-]{36}$/i.test(uid)||!/^\S+@\S+\.\S+$/.test(email))throw new DriveFailure('configuration_missing');
 return c;
}
export function substituteName(pattern:string,values:{taskTag:string;taskTitle:string;employeeId:string}):string {
 const result=pattern.replaceAll('[Task Tag]',values.taskTag).replaceAll('[Task Title]',values.taskTitle).replaceAll('[Employee ID]',values.employeeId);
 if(!result.trim()||result.length>500)throw new DriveFailure('configuration_missing');return result;
}
export interface RemoteFile {id:string;name:string;mimeType:string;parents?:string[];driveId?:string;webViewLink?:string;trashed?:boolean;version?:string;appProperties?:Record<string,string>;shortcutDetails?:{targetId:string;targetMimeType?:string};capabilities?:{canAddChildren?:boolean;canShare?:boolean}}
export interface RemotePermission {id:string;type:string;role:string;emailAddress?:string;permissionDetails?:{inherited?:boolean}[]}
export interface DriveStep {key:string;owner:string;kind:'folder'|'create'|'copy'|'rename'|'shortcut'|'permission'|'verify';name:string;mimeType:string;parent?:string;parentKey?:string;sourceId?:string;sourceVersion?:string;targetId?:string;assetId?:string;email?:string;role?:'commenter';ipoRole?:'input'|'process'|'output'|'reference';templateVersion?:string}
export interface StepState {externalId:string|null;reservedId:string|null;dispatched:boolean;verified:RemoteFile|null}
export interface DriveJob {id:string;leaseToken:string;taskId:string;command:DriveCommand;policy:DrivePolicy;request:Record<string,unknown>;taskTag:string;taskTitle:string;employeeId:string;employeeUserId:string;templateVersionId:string|null;reviewerIds:string[];predecessorAsset?:RemoteFile|null;asset?:RemoteFile|null;steps:DriveStep[]|null}
export const FAILURE_HELP:Record<FailureCode,string>={configuration_missing:'Ask an administrator to configure the sandbox account, root and templates.',configuration_changed:'Configuration changed. Review the retained job before retrying.',credentials_missing:'An administrator must configure provider authorization.',credentials_revoked:'An administrator must reconnect Google authorization before retrying.',access_denied:'Check access to the selected Google resource.',root_unavailable:'Check the configured sandbox destination.',template_missing:'Check the selected template source.',template_changed:'The pinned template version changed. Review existing copies before retrying.',quota_limited:'Google quota is limited. Retry after the displayed delay.',provider_unavailable:'Google is temporarily unavailable. Retry safely.',remote_uncertain:'The remote outcome is uncertain. Reconcile the original operation before creating another asset.',identity_mismatch:'The remote identity differs from its recorded association. Reconcile it before proceeding.',unsupported_type:'This file type is unavailable for the selected operation.',sharing_failed:'The asset exists, but reviewer access failed. Retry sharing separately.',sharing_conflict:'Existing access differs from the approved reviewer permission. No access was changed.',predecessor_asset_missing:'Verify the predecessor folder before creating its shortcut.',task_archived:'The task is archived. Provider changes are blocked.',resource_busy:'Another worker is using the same resource. Retry shortly.'};
