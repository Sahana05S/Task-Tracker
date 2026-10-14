import approved from './approved-sandbox.json';
import { DriveFailure,validatePolicy,type DrivePolicy } from './contract';

function canonical(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>JSON.stringify(key)+':'+canonical(item)).join(',')+'}';
 return JSON.stringify(value);
}
/** Fixed user approval is secret-free. Identity is supplied separately, never
 * guessed from a folder URL, an employee profile, or source-script IDs. */
export function completeApprovedSandboxPolicy(identity:{accountScope:string;organizationEmail:string;sharedDriveId:string;reviewerEmails:Record<string,string>}):DrivePolicy {
 const policy=validatePolicy({...approved,...identity});assertApprovedSandboxPolicy(policy);return policy;
}
export function assertApprovedSandboxPolicy(value:unknown):asserts value is DrivePolicy {
 const policy=validatePolicy(value);
 for(const [key,expected] of Object.entries(approved))if(canonical(policy[key as keyof DrivePolicy])!==canonical(expected))throw new DriveFailure('configuration_changed');
}
