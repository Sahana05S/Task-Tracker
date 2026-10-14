import 'server-only';
import approved from './approved-sandbox.json';
import { DriveFailure,DRIVE_MIME } from './contract';
import { GoogleDrive,type DriveProvider } from './provider';
import { googleToken } from './auth';

/** Read-only bootstrap: no database writes or Google create/rename/share calls.
 * Resolve the actual Shared Drive ID only after verifying the selected account. */
export async function verifyApprovedSandboxAccess(
 env:Readonly<Record<string,string|undefined>>=process.env,
 factory:(email:string)=>DriveProvider=email=>new GoogleDrive(googleToken({auth:'shared_drive_service_account',organizationEmail:email,scope:'drive'},env)),
){
 const expected=env.TASKPULSE_DRIVE_SERVICE_ACCOUNT_EMAIL;
 if(!expected||!/^\S+@\S+\.\S+$/.test(expected))throw new DriveFailure('credentials_missing');
 let identity:{client_email?:string;project_id?:string};try{identity=JSON.parse(env.TASKPULSE_DRIVE_SERVICE_ACCOUNT_JSON??'');}catch{throw new DriveFailure('credentials_missing');}
 if(identity.client_email!==expected||!identity.project_id)throw new DriveFailure('configuration_changed');
 const provider=factory(expected);
 if((await provider.principal()).toLowerCase()!==expected.toLowerCase())throw new DriveFailure('configuration_changed');
 const root=await provider.get(approved.rootId);
 if(root.id!==approved.rootId||root.mimeType!==DRIVE_MIME.folder||root.trashed||!root.driveId||root.capabilities?.canAddChildren!==true)throw new DriveFailure('root_unavailable');
 return {status:'verified_root',rootId:root.id,sharedDriveId:root.driveId,organizationEmail:expected,accountScope:'service:'+identity.project_id+':'+expected};
}
