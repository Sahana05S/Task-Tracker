import { describe,it,expect,vi } from 'vitest';
import { DRIVE_MIME,DriveFailure,validatePolicy,type DrivePolicy,type DriveStep,type DriveJob,type RemoteFile,type RemotePermission,type StepState } from '@/lib/integrations/drive/contract';
import { executeStep,GoogleDrive,markerFor,shareReviewer,type DriveProvider } from '@/lib/integrations/drive/provider';
import { buildPlan } from '@/lib/integrations/drive/plan';
export const policy:DrivePolicy={id:'fixture-only',sandbox:true,accountScope:'synthetic-drive',auth:'organization_oauth',scope:'drive.file',organizationEmail:'worker@example.test',rootId:'synthetic_root',sharedDriveId:null,employeeName:'[Employee ID]',taskName:'[Task Tag] - [Task Title]',roleFolders:{input:['Input'],process:['Process'],output:['Output']},templates:{},initializeTemplates:[],blankKinds:['document','sheet','slides'],autoInitialize:false,checklistAuthority:'native',reviewerSharing:'none',reviewerEmails:{}};
const empty=():StepState=>({externalId:null,reservedId:null,dispatched:false,verified:null});
const step:DriveStep={key:'task:synthetic/op1',owner:'synthetic-task',kind:'create',name:'TAG work',mimeType:DRIVE_MIME.document,parent:'parent'};
class Fake implements DriveProvider{
 files=new Map<string,RemoteFile>();creates=0;copies=0;renames=0;shares=0;lost=false;hidden=false;denyShare=false;acl:RemotePermission[]=[];
 constructor(){
  this.files.set(policy.rootId,{id:policy.rootId,name:'Sandbox',mimeType:DRIVE_MIME.folder,parents:[]});
  this.files.set('parent',{id:'parent',name:'Task folder',mimeType:DRIVE_MIME.folder,parents:[policy.rootId]});
  this.files.set('predecessor',{id:'predecessor',name:'Earlier sandbox work',mimeType:DRIVE_MIME.folder,parents:['parent']});
  this.files.set('file',{id:'file',name:'Work',mimeType:DRIVE_MIME.document,parents:['parent']});
 }
 async get(id:string){const f=this.files.get(id);if(!f)throw new DriveFailure('template_missing');return structuredClone(f);}
 async children(id:string){return [...this.files.values()].filter(f=>f.parents?.includes(id));}
 async find(marker:string){return this.hidden?[]:[...this.files.values()].filter(f=>f.appProperties?.taskpulse===marker);}
 async reserve(){return 'reserved-folder';}
 async create(body:Record<string,unknown>){this.creates++;const file={...body,id:String(body.id??'remote-'+this.creates),webViewLink:'https://docs.google.com/document/d/remote/edit'} as unknown as RemoteFile;this.files.set(file.id,file);if(this.lost)throw new DriveFailure('remote_uncertain',true);return file;}
 async copy(id:string,body:Record<string,unknown>){this.copies++;return this.create(body);}
 async rename(id:string,name:string){this.renames++;this.files.get(id)!.name=name;return this.get(id);}
 async permissions(){return this.acl;}
 async share(id:string,email:string){this.shares++;if(this.denyShare)throw new DriveFailure('access_denied');this.acl.push({id:'permission',type:'user',role:'commenter',emailAddress:email});}
 async principal(){return policy.organizationEmail;}
}
describe('M10 independent provider recovery fixtures',()=>{
 it('blocks absent policy and explicit production configuration',()=>{expect(()=>validatePolicy(null)).toThrow('configuration_missing');expect(()=>validatePolicy({...policy,sandbox:false})).toThrow();});
 it('requires shared-drive ownership for a service identity',()=>expect(()=>validatePolicy({...policy,auth:'shared_drive_service_account'})).toThrow());
 it('does not claim Drawing/Form blank creation without source templates',()=>expect(()=>validatePolicy({...policy,blankKinds:['form']})).toThrow());
 it.each([
  ['document','application/vnd.google-apps.document','create'],
  ['sheet','application/vnd.google-apps.spreadsheet','create'],
  ['slides','application/vnd.google-apps.presentation','create'],
  ['drawing','application/vnd.google-apps.drawing','copy'],
  ['form','application/vnd.google-apps.form','copy'],
 ] as const)('uses the independently specified %s operation and MIME',async(kind,mime,operation)=>{
  const p=new Fake(),usesTemplate=kind==='drawing'||kind==='form';
  const configured=validatePolicy({...policy,blankKinds:[kind],templates:usesTemplate?{blank:{id:'blank_template',version:'1',mimeType:mime,role:'process',label:'blank',blankKind:kind}}:{}});
  if(usesTemplate)p.files.set('blank_template',{id:'blank_template',name:'Blank',mimeType:mime,version:'1'});
  const job={id:'job',taskId:'task',taskTag:'T27',taskTitle:'Survey',employeeId:'EMP4',employeeUserId:'member',command:'blank',policy:configured,request:{fileKind:kind,ipoRole:'process',name:'[Task Tag] notes'},reviewerIds:[]} as unknown as DriveJob;
  const manifest=await buildPlan(job,p),asset=manifest.find(s=>s.key==='task:task/operation:job');
  expect(asset).toMatchObject({kind:operation,mimeType:mime,name:'T27 notes'});
  expect(asset?.sourceId).toBe(usesTemplate?'blank_template':undefined);
 });
 it('marks unsupported blank kinds unavailable rather than inventing a URL',()=>expect(()=>validatePolicy({...policy,blankKinds:['flowchart']})).toThrow('configuration_missing'));
 it('persists native dispatch before POST and publishes only GET-verified identity',async()=>{
  const p=new Fake();let state=empty();const saved:StepState[]=[];
  const result=await executeStep(p,policy,step,state,'parent',async s=>{saved.push(structuredClone(s));state=s;});
  expect(saved[0].dispatched).toBe(true);expect(saved[0].externalId).toBeNull();expect(result.id).toBe('remote-1');expect(p.creates).toBe(1);
  expect(result.appProperties?.taskpulse).toBe(markerFor(policy,step.key));
 });
 it('reconciles success followed by timeout without another native POST',async()=>{
  const p=new Fake();p.lost=true;let state=empty();const persist=async(s:StepState)=>{state=s;};
  await expect(executeStep(p,policy,step,state,'parent',persist)).rejects.toThrow('remote_uncertain');
  const recovered=await executeStep(p,policy,step,state,'parent',persist);expect(recovered.id).toBe('remote-1');expect(p.creates).toBe(1);
 });
 it('retains uncertainty when marker visibility lags; repeated retries never duplicate',async()=>{
  const p=new Fake();p.lost=true;let state=empty();const persist=async(s:StepState)=>{state=s;};
  await expect(executeStep(p,policy,step,state,'parent',persist)).rejects.toThrow();p.hidden=true;
  for(let i=0;i<3;i++)await expect(executeStep(p,policy,step,state,'parent',persist)).rejects.toThrow('remote_uncertain');expect(p.creates).toBe(1);
 });
 it('reuses the reserved folder ID after remote success with lost response',async()=>{
  const p=new Fake();p.lost=true;p.hidden=true;let state=empty();const folder={...step,kind:'folder' as const,mimeType:DRIVE_MIME.folder};
  const persist=async(s:StepState)=>{state=s;};await expect(executeStep(p,policy,folder,state,'parent',persist)).rejects.toThrow();
  const result=await executeStep(p,policy,folder,state,'parent',persist);expect(result.id).toBe('reserved-folder');expect(p.creates).toBe(1);
 });
 it('rejects duplicate markers and incorrect parents without creating',async()=>{
  const p=new Fake();const f={id:'first',name:step.name,mimeType:step.mimeType,parents:['wrong'],appProperties:{taskpulse:markerFor(policy,step.key)}};p.files.set(f.id,f);
  await expect(executeStep(p,policy,step,empty(),'parent',async()=>{})).rejects.toThrow('identity_mismatch');
  p.files.set('second',{...f,id:'second'});await expect(executeStep(p,policy,step,empty(),'parent',async()=>{})).rejects.toThrow('identity_mismatch');expect(p.creates).toBe(0);
 });
 it('actually renames by bound provider ID and verifies remote metadata',async()=>{
  const p=new Fake();const f={id:'bound',name:'old',mimeType:DRIVE_MIME.folder,parents:['parent'],appProperties:{taskpulse:markerFor(policy,step.key)}};p.files.set(f.id,f);
  const result=await executeStep(p,policy,{...step,kind:'rename',mimeType:f.mimeType,name:'new'}, {...empty(),externalId:f.id,verified:f},'parent',async()=>{});
  expect(result.name).toBe('new');expect(p.renames).toBe(1);expect(p.creates).toBe(0);
 });
 it('does not copy a changed source version',async()=>{
  const p=new Fake();p.files.set('template',{id:'template',name:'source',mimeType:step.mimeType,version:'2'});
  await expect(executeStep(p,policy,{...step,kind:'copy',sourceId:'template',sourceVersion:'1'},empty(),'parent',async()=>{})).rejects.toThrow('template_changed');expect(p.copies).toBe(0);
 });
 it('records verified shortcut target without altering target ACL',async()=>{
  const p=new Fake();const shortcut={...step,kind:'shortcut' as const,mimeType:DRIVE_MIME.shortcut,targetId:'predecessor'};
  const result=await executeStep(p,policy,shortcut,empty(),'parent',async()=>{});expect(result.shortcutDetails?.targetId).toBe('predecessor');expect(p.shares).toBe(0);
 });
 it('separates asset success from sharing failure and resumes sharing only',async()=>{
  const p=new Fake();const file=await executeStep(p,policy,step,empty(),'parent',async()=>{});p.denyShare=true;
  await expect(shareReviewer(p,file.id,'reviewer@example.test',false,async()=>{},policy.rootId)).rejects.toThrow('sharing_failed');
  expect(p.files.has(file.id)).toBe(true);p.denyShare=false;await shareReviewer(p,file.id,'reviewer@example.test',false,async()=>{},policy.rootId);
  await shareReviewer(p,file.id,'reviewer@example.test',true,async()=>{},policy.rootId);expect(p.creates).toBe(1);expect(p.shares).toBe(2);
 });
 it('never changes a stronger existing reviewer grant',async()=>{
  const p=new Fake();p.acl=[{id:'existing',type:'user',role:'writer',emailAddress:'reviewer@example.test'}];
  await expect(shareReviewer(p,'file','reviewer@example.test',false,async()=>{},policy.rootId)).rejects.toThrow('sharing_conflict');expect(p.shares).toBe(0);
 });
 it('does not repeat an uncertain permission create without reconciliation',async()=>{const p=new Fake();await expect(shareReviewer(p,'file','r@example.test',true,async()=>{},policy.rootId)).rejects.toThrow('remote_uncertain');expect(p.shares).toBe(0);});
 it('blocks creation after a destination ancestor moves outside the sandbox',async()=>{
  const p=new Fake();p.files.get('parent')!.parents=[];
  await expect(executeStep(p,policy,step,empty(),'parent',async()=>{})).rejects.toThrow('identity_mismatch');expect(p.creates).toBe(0);
 });
 it('blocks rename after an ancestor moves, even with the original marker and parent',async()=>{
  const p=new Fake(),file={id:'bound',name:'old',mimeType:DRIVE_MIME.folder,parents:['parent'],appProperties:{taskpulse:markerFor(policy,step.key)}};
  p.files.set(file.id,file);p.files.get('parent')!.parents=[];
  await expect(executeStep(p,policy,{...step,kind:'rename',name:'new',mimeType:file.mimeType},{...empty(),externalId:file.id,verified:file},'parent',async()=>{})).rejects.toThrow('identity_mismatch');expect(p.renames).toBe(0);
 });
 it('blocks reviewer sharing after a file moves outside the sandbox',async()=>{
  const p=new Fake();p.files.get('file')!.parents=[];
  await expect(shareReviewer(p,'file','r@example.test',false,async()=>{},policy.rootId)).rejects.toThrow('identity_mismatch');expect(p.shares).toBe(0);
 });
 it('does not shortcut an external business predecessor in the sandbox-only phase',async()=>{
  const p=new Fake();p.files.get('predecessor')!.parents=[];
  await expect(executeStep(p,policy,{...step,kind:'shortcut',mimeType:DRIVE_MIME.shortcut,targetId:'predecessor'},empty(),'parent',async()=>{})).rejects.toThrow('identity_mismatch');expect(p.creates).toBe(0);
 });
 it.each([[401,'credentials_revoked'],[429,'quota_limited'],[404,'template_missing'],[503,'provider_unavailable']] as const)('maps HTTP %s to a safe GET failure',async(status,code)=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{message:'secret provider detail'}}),{status}));
  await expect(new GoogleDrive(async()=> 'synthetic-token',fetcher).get('file')).rejects.toThrow(code);
 });
 it('uses literal resource IDs, atomic markers and comment-only permission requests',async()=>{
  const fetcher=vi.fn().mockImplementation(async()=>new Response('{"id":"verified"}',{status:200}));const p=new GoogleDrive(async()=> 'synthetic-token',fetcher);
  await p.copy('source/id',{name:'copy',appProperties:{taskpulse:'marker'}});await p.share('file','r@example.test');
  expect(fetcher.mock.calls[0][0]).toContain('source%2Fid/copy');expect(fetcher.mock.calls[0][0]).toContain('copyComments=false');
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({type:'user',role:'commenter',emailAddress:'r@example.test'});expect(fetcher.mock.calls[1][0]).toContain('sendNotificationEmail=false');
 });
 it('pins a recursive template manifest with substitutions and stable source identities',async()=>{
  const p=new Fake();p.files.set('template_folder',{id:'template_folder',name:'[Task Tag] assets',mimeType:DRIVE_MIME.folder,version:'1'});
  p.files.set('template_doc',{id:'template_doc',name:'[Task Title] notes',mimeType:DRIVE_MIME.document,parents:['template_folder'],version:'4'});
  const configured={...policy,templates:{bundle:{id:'template_folder',version:'1',mimeType:DRIVE_MIME.folder,role:'process' as const,label:'bundle'}},initializeTemplates:['bundle']};
  const job={id:'job',taskId:'task',taskTag:'T27',taskTitle:'Survey',employeeId:'EMP4',employeeUserId:'member',command:'initialize',policy:configured,request:{},reviewerIds:[]} as unknown as DriveJob;
  const plan=await buildPlan(job,p);expect(plan.find(s=>s.sourceId==='template_doc')).toMatchObject({name:'Survey notes',sourceVersion:'4',key:'task:task/template:bundle/template_doc'});
  expect(plan.find(s=>s.key==='employee:member')?.name).toBe('EMP4');expect(plan.find(s=>s.key==='task:task')?.name).toBe('T27 - Survey');
 });
});
