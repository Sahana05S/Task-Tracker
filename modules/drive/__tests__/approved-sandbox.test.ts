import { describe,it,expect } from 'vitest';
import { assertApprovedSandboxPolicy,completeApprovedSandboxPolicy } from '@/modules/drive/internal/approved-sandbox';
import pending from '@/__tests__/fixtures/m10-approved-sandbox.pending.json';
const identity={accountScope:'synthetic-project-and-account',organizationEmail:'synthetic@example.test',sharedDriveId:'synthetic_shared_drive',reviewerEmails:{}};
describe('M10 exact approved sandbox policy',()=>{
 it('pins the user root, manual phase, no templates, three kinds and native/commenter contract',()=>{
  const p=completeApprovedSandboxPolicy(identity);
  expect(p).toMatchObject({rootId:'13G0w_T5i6cKUMiREETYlpH9Z_3G-RyGH',auth:'shared_drive_service_account',scope:'drive',autoInitialize:false,templates:{},initializeTemplates:[],blankKinds:['document','sheet','slides'],checklistAuthority:'native',reviewerSharing:'commenter_files'});
  expect(p.roleFolders).toEqual({input:['Input'],process:['Process'],output:['Output']});
 });
 it('does not fabricate a principal/Shared Drive identity from the folder URL',()=>expect(()=>assertApprovedSandboxPolicy(pending)).toThrow('configuration_missing'));
 it.each([
  {rootId:'unapproved_root'}, {autoInitialize:true}, {blankKinds:['document','sheet','slides','form']},
  {initializeTemplates:['unexpected']}, {reviewerSharing:'none'}, {auth:'organization_oauth',sharedDriveId:null},
  {roleFolders:{input:['Input'],process:['Business'],output:['Output']}},
 ])('rejects a policy outside the follow-up approval: %j',changes=>{
  expect(()=>assertApprovedSandboxPolicy({...completeApprovedSandboxPolicy(identity),...changes})).toThrow();
 });
 it('accepts JSONB object key order without broadening the selected paths',()=>{
  const p=completeApprovedSandboxPolicy(identity);assertApprovedSandboxPolicy({...p,roleFolders:{output:['Output'],input:['Input'],process:['Process']}});
 });
});
