'use client';
import { useRef,useState,useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { requestDriveOperation } from '@/app/tasks/drive-actions';
import { FAILURE_HELP,type FailureCode } from '@/lib/integrations/drive/contract';
import type { Task } from '@/types/tracker';
import { DRIVE_INTEGRATION_DEFERRED,DRIVE_UNAVAILABLE_MESSAGE } from '@/lib/integrations/drive/availability';

export interface DriveReadModel {
 configured:boolean;configuration?:{blankKinds:string[];templates:{key:string;label:string}[]};
 jobs:{id:string;taskId:string;command:string;status:string;attempts:number;errorCode:FailureCode|null;retryAfter:string;assets:{key:string;kind:string;name:string|null;url:string|null;verified:boolean}[]}[];
}
const input='w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm';
export function DriveOperations({tasks,model,canManage}:{tasks:readonly Task[];model:DriveReadModel|null;canManage:boolean}){
 const router=useRouter(),operation=useRef<string|null>(null);
 const [taskId,setTask]=useState(tasks.find(t=>!t.archivedEffectiveDate)?.id??''),[command,setCommand]=useState('initialize'),[message,setMessage]=useState(''),[pending,start]=useTransition();
 const task=tasks.find(t=>t.id===taskId),jobs=model?.jobs.filter(j=>j.taskId===taskId)??[];
 const assets=[...new Map(jobs.flatMap(j=>j.assets).filter(a=>a.verified&&a.kind!=='permission').map(a=>[a.key,a])).values()];
 function send(form:FormData){
  form.set('taskId',taskId);form.set('expectedVersion',String(task?.lifecycleVersion??0));
  operation.current??=crypto.randomUUID();form.set('operationId',operation.current);
  start(async()=>{const result=await requestDriveOperation(form);setMessage(result.success?'Request recorded. Provider results appear only after verification.':result.error??'Request failed.');if(result.success){operation.current=null;router.refresh();}});
 }
 return <section className="soft-card grid gap-3 p-4"><h2 className="font-semibold">Google Drive operations{DRIVE_INTEGRATION_DEFERRED?' — unavailable':''}</h2>
  <p className="text-sm">Native task details and checklists remain available. Existing asset links can be registered manually. External checklist copies are assets.</p>
  {DRIVE_INTEGRATION_DEFERRED?<p>{DRIVE_UNAVAILABLE_MESSAGE}</p>:!model?<p>Drive operations are unavailable.</p>:!model.configured?<p>Provider creation is disabled until sandbox configuration is verified.</p>:null}
  <select aria-label="Drive task" className={input} value={taskId} onChange={e=>{setTask(e.target.value);operation.current=null;}}>{tasks.map(t=><option key={t.id} value={t.id}>{t.taskTag}{t.archivedEffectiveDate?' (archived)':''}</option>)}</select>
  {canManage&&!DRIVE_INTEGRATION_DEFERRED?<form action={send} onChange={()=>{operation.current=null;}} className="grid gap-3">
   <select aria-label="Provider operation" name="command" className={input} value={command} onChange={e=>setCommand(e.target.value)}>
    <option value="initialize">Create task folders and configured templates</option><option value="blank">Create blank work file</option><option value="copy_template" disabled={!model?.configuration?.templates.length}>Copy configured template (requires approved templates)</option><option value="rename">Rename verified provider asset</option><option value="carryover_shortcut">Create predecessor shortcut</option>
   </select>
   {['blank','rename'].includes(command)?<input name="name" required maxLength={300} placeholder="Actual provider name" className={input}/>:null}
   {command==='blank'?<><select name="fileKind" aria-label="File kind" className={input}>{(model?.configuration?.blankKinds??[]).map(k=><option key={k}>{k}</option>)}</select><select name="ipoRole" aria-label="Destination" className={input}>{['input','process','output'].map(k=><option key={k}>{k}</option>)}</select></>:null}
   {command==='copy_template'?<select name="templateKey" aria-label="Template" className={input}>{model?.configuration?.templates.map(t=><option key={t.key} value={t.key}>{t.label}</option>)}</select>:null}
   {command==='rename'?<select name="assetKey" aria-label="Provider asset" className={input}>{assets.map(a=><option key={a.key} value={a.key}>{a.name}</option>)}</select>:null}
   <button className="rounded border px-3 py-2 text-sm" disabled={pending||!model?.configured||!!task?.archivedEffectiveDate||!task}>Queue provider operation</button>
  </form>:null}
  <p role="status" className="text-sm">{message}</p>
  {jobs.map(j=><div key={j.id} className="grid gap-2 rounded border p-3 text-sm"><p>Retained job record: {j.command}: {j.status} · {j.attempts} attempts</p>
   {j.errorCode?<p>{FAILURE_HELP[j.errorCode]??'Administrator review required.'}</p>:null}
   {j.assets.filter(a=>a.verified&&a.kind!=='permission').map(a=><p key={a.key}>{a.url?<a href={a.url} target="_blank" rel="noreferrer" className="underline">{a.name}</a>:`${a.name}: verified; Google did not return an opening link.`}</p>)}
   {canManage&&!DRIVE_INTEGRATION_DEFERRED&&['failed','blocked'].includes(j.status)&&!task?.archivedEffectiveDate?<form action={form=>{form.set('command','retry');form.set('jobId',j.id);send(form);}}><button disabled={pending} className="underline">Retry / reconcile retained operation</button></form>:null}
   {canManage&&!DRIVE_INTEGRATION_DEFERRED&&['credentials_missing','credentials_revoked'].includes(j.errorCode??'')?<p>Reconnect through your organization’s approved Google authorization and update the server secret securely, then retry. Google sign-in alone does not reconnect Drive.</p>:null}
  </div>)}
 </section>;
}
