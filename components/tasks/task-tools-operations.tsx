'use client';

import { useState,useTransition } from 'react';
import { previewTaskTool,commitTaskTool } from '@/app/(workspace)/task-tools/operation-actions';
import { Button } from '@/shared/ui/button';
import type { Task,User } from '@/types/tracker';
import type { Json } from '@/types/database';
import type { ToolOperation,ToolsPreview } from '@/lib/task-tools/contract';

const input='field w-full';
const commands:[ToolOperation,string][]=[['support','Effort / Skill support'],['duplicate','Single duplicate'],['weekly','Weekly phases'],['day_count','Day-count phases'],['all_team','One task per active team member'],['number_suffix','Number and suffix'],['carryover','Carryover to this month'],['bulk_done','Done (checklist and review gates)'],['bulk_reopen','Manager reopen'],['section','Confirm Setup / Activity / Closure'],['refresh','Refresh shared metrics'],['archive','Retained archive']];
export function TaskToolsOperations({tasks,members,canManage}:{tasks:readonly Task[];members:readonly User[];canManage:boolean}) {
 const [command,setCommand]=useState<ToolOperation>('refresh'),[preview,setPreview]=useState<ToolsPreview|null>(null),[key,setKey]=useState(''),[message,setMessage]=useState(''),[pending,start]=useTransition();
 const copies=['support','duplicate','weekly','day_count','all_team','number_suffix','carryover'].includes(command);
 const batches=['weekly','day_count','number_suffix'].includes(command);
 const names=new Map(members.map(m=>[m.id,m.fullName]));
 const invalidate=()=>{setPreview(null);setMessage('');};
 function prepare(form:FormData){
  const payload:Record<string,Json>={};
  for(const [name,value] of form.entries()){
   if(typeof value!=='string'||value==='')continue;
   if(name==='taskIds'){payload.taskIds=form.getAll(name).map(String);continue;}
   if(['count','phaseDays'].includes(name))payload[name]=Number(value);
   else if(name==='intentionalEmpty')payload[name]=value==='true';
   else payload[name]=value;
  }
  start(async()=>{setMessage('');try{const result=await previewTaskTool(command,payload);if(result.success){setPreview(result.data);setKey(crypto.randomUUID());}else setMessage(result.error);}catch{setMessage('Preview could not be loaded. Try again.');}});
 }
 return <div className="grid gap-4">
  <p className="text-sm text-muted-foreground">Review the planned tasks before committing. Copies reset execution state; batches commit together. Archived work remains readable. Provider files are separate; these operations create native records only.</p>
  <select aria-label="Task operation" className={`${input} font-semibold`} value={command} disabled={pending} onChange={e=>{setCommand(e.target.value as ToolOperation);invalidate();}}>{commands.filter(([c])=>canManage||['bulk_done','refresh'].includes(c)).map(([c,label])=><option key={c} value={c}>{label}</option>)}</select>
  <form action={prepare} onChange={invalidate} className="grid gap-3"><fieldset disabled={pending} className="contents">
   <label className="field-label">{copies?'Source task':'Tasks (Ctrl/Cmd to select several)'}<select className={input} name={copies?'sourceTaskId':'taskIds'} multiple={!copies} required disabled={pending}>{copies?<option value="">Select task</option>:null}{tasks.filter(t=>!t.archivedEffectiveDate).map(t=><option key={t.id} value={t.id}>{t.taskTag} · {t.title}</option>)}</select></label>
   {copies?<div className="grid gap-2 sm:grid-cols-2"><label className="field-label">Assignment date<input className={input} name="startDate" type="date" required/></label>{!['weekly','day_count'].includes(command)?<label className="field-label">New deadline (optional)<input className={input} name="dueDate" type="date"/></label>:null}</div>:null}
   {command==='support'?<><label className="field-label">Kind<select className={input} name="supportKind"><option value="effort">Effort: source category</option><option value="skill">Skill: SD</option></select></label><label className="field-label">Mode<select className={input} name="splitMode"><option value="split-even">Even: half transferred</option><option value="split-uneven">Uneven: scale amount transferred</option><option value="proportional">Proportional: linked percentage</option><option value="absolute">Absolute: independent scale</option></select></label><label className="field-label">Support assignee<select name="assigneeId" className={input} required><option value="">Select member</option>{members.filter(m=>m.isActive).map(m=><option key={m.id} value={m.id}>{m.fullName}</option>)}</select></label><label className="field-label">Scale units (Uneven / Absolute)<input className={input} name="amount" type="number" step="any" min="0"/></label><label className="field-label">Source percentage (Proportional only, 0–100%)<input className={input} name="percentage" type="number" step="any" min="0" max="100"/></label></>:null}
   {batches?<label className="field-label">Number of tasks<input className={input} name="count" type="number" min="1" max="100" required/></label>:null}
   {command==='day_count'?<label className="field-label">Calendar days per phase<input className={input} name="phaseDays" type="number" min="1" max="366" required/></label>:null}
   {command==='number_suffix'?<label className="field-label">Title suffix<input className={input} name="suffix" maxLength={100}/></label>:null}
   {command==='carryover'?<label className="field-label">Target month (current month only)<input className={input} name="targetMonth" type="month" required/></label>:null}
   {command==='section'?<><label className="field-label">Section<select className={input} name="section"><option value="setup">Setup</option><option value="activity">Activity</option><option value="closure">Closure</option></select></label><label className="field-label">Confirmation<select className={input} name="intentionalEmpty"><option value="false">Confirm section initialized; preserve leaf work</option><option value="true">Confirm intentionally empty; applicable leaves must be absent</option></select></label></>:null}
   <label className="field-label">Reason (required for scale transfers, reopen, section, carryover and archive)<input className={input} name="reason" maxLength={1000}/></label>
   <Button type="submit" disabled={pending}>{pending?'Working…':'Prepare preview'}</Button>
  </fieldset></form>
  {preview?<div className="border-border bg-muted/40 grid gap-3 rounded-xl border p-4 text-sm"><p>{preview.items.length} item(s). Preview expires {new Date(preview.expiresAt).toLocaleTimeString()}.</p>{preview.sourceScaleBefore!==null?<p>Source scale: {preview.sourceScaleBefore} → {preview.sourceScaleAfter??'unchanged'}</p>:null}
   {!preview.ready?<p role="status">Cannot commit: {preview.reasons.map(r=>r.replaceAll('_',' ')).join('; ')}.</p>:null}
   <div className="border-border overflow-x-auto rounded-xl border bg-white"><table className="sheet-grid w-full"><thead><tr>{['Tag / title','Dates','Scale','Assignees / shares','Reviewers'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{preview.items.map((t,i)=><tr key={t.taskTag??`planned-${i}`}><td>{t.taskTag??'No number allocated'} · {t.title}</td><td>{t.assignedDate} → {t.dueDate??'No deadline'}</td><td>{t.scale??'Unavailable'} ({t.scaleMode})</td><td>{t.assignees?.map((id,i)=>`${names.get(id)??'Unknown member'} (${t.shares?.[i]===undefined?'unavailable':t.shares[i]/10000+'%'})`).join(', ')??'Unchanged'}</td><td>{t.reviewers?.map(id=>names.get(id)??'Unknown member').join(', ')??'Unchanged'}</td></tr>)}</tbody></table></div>
   {copies?<ul className="list-disc pl-5">{Object.entries(preview.inheritance).map(([name,value])=><li key={name}><strong>{name}:</strong> {value}</li>)}</ul>:null}
   <Button disabled={pending||!preview.ready} onClick={()=>start(async()=>{try{const result=await commitTaskTool(preview.id,key);if(result.success){setMessage(result.data.items.map(i=>`${i.taskTag}: ${i.status.replaceAll('_',' ')}`).join('; '));setPreview(null);}else setMessage(result.error);}catch{setMessage('Response unavailable. Retry this same preview; its operation key is retained.');}})}>Commit reviewed preview</Button>
  </div>:null}
  {message?<p role="status" className="bg-muted/70 rounded-xl px-3 py-2 text-sm">{message}</p>:null}
  <Button variant="outline" onClick={()=>{const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),tasks:tasks.map(t=>({id:t.id,tag:t.taskTag,title:t.title,archivedEffectiveDate:t.archivedEffectiveDate??null,handoffSuccessorId:t.handoffSuccessorId??null}))},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='task-tags.json';a.click();URL.revokeObjectURL(url);}}>Export visible task tags (JSON)</Button>
  <p className="text-xs text-muted-foreground">Tag export preserves identity. Historical import is deferred by your decision. Archive retains history; physical removal is unavailable. No Drive operation is requested.</p>
 </div>;
}
