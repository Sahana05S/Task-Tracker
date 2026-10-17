import { describe,it,expect,vi } from 'vitest';
vi.mock('server-only',()=>({}));
import { verifyApprovedSandboxAccess } from '@/modules/drive/internal/setup';
import { DRIVE_MIME,type RemoteFile } from '@/modules/drive/internal/contract';
import type { DriveProvider } from '@/modules/drive/internal/provider';
const rootId='13G0w_T5i6cKUMiREETYlpH9Z_3G-RyGH',email='synthetic@example.test';
const env={TASKPULSE_DRIVE_SERVICE_ACCOUNT_EMAIL:email,TASKPULSE_DRIVE_SERVICE_ACCOUNT_JSON:JSON.stringify({client_email:email,project_id:'synthetic-project'})};
function provider(changes:Partial<RemoteFile>={}){
 return {principal:vi.fn(async()=>email),get:vi.fn(async()=>({id:rootId,name:'Sandbox',mimeType:DRIVE_MIME.folder,driveId:'actual_lookup_drive',capabilities:{canAddChildren:true},...changes})),create:vi.fn(),copy:vi.fn(),rename:vi.fn(),share:vi.fn()} as unknown as DriveProvider;
}
describe('M10 read-only approved-root setup',()=>{
 it('fails closed without securely configured identity, before any Google calls',async()=>{const factory=vi.fn();await expect(verifyApprovedSandboxAccess({},factory)).rejects.toThrow('credentials_missing');expect(factory).not.toHaveBeenCalled();});
 it('discovers the actual Shared Drive identity without creating or sharing',async()=>{
  const p=provider();const info=await verifyApprovedSandboxAccess(env,()=>p);expect(info).toMatchObject({status:'verified_root',rootId,sharedDriveId:'actual_lookup_drive',organizationEmail:email});
  expect(p.get).toHaveBeenCalledWith(rootId);expect(p.create).not.toHaveBeenCalled();expect(p.share).not.toHaveBeenCalled();expect(p.rename).not.toHaveBeenCalled();
 });
 it.each([{driveId:undefined},{id:'wrong_root'},{mimeType:DRIVE_MIME.document},{trashed:true},{capabilities:{canAddChildren:false}}])('rejects root/account capability evidence %j',async change=>{await expect(verifyApprovedSandboxAccess(env,()=>provider(change))).rejects.toThrow('root_unavailable');});
 it('rejects a mismatched service identity before reading the folder',async()=>{const p=provider();vi.mocked(p.principal).mockResolvedValue('another@example.test');await expect(verifyApprovedSandboxAccess(env,()=>p)).rejects.toThrow('configuration_changed');expect(p.get).not.toHaveBeenCalled();});
});
