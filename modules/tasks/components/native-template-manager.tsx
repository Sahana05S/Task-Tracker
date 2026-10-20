'use client';
import { buttonVariants } from '@/shared/ui/button';
import {useState} from 'react';
import {ExecutionForm} from '@/shared/ui/execution-form';
import {publishNativeTemplate} from '@/modules/tasks/detail-actions';
import {DETAIL_FIELDS,type NativeTemplate} from '@/modules/tasks/internal/details-contract';
const input='field w-full';
export function NativeTemplateManager({templates}:{templates:readonly NativeTemplate[]}) {
 const [selection,setSelection]=useState('');const selected=templates.find(t=>t.id===selection);
 const [nodes,setNodes]=useState<{key:string;title:string;section:string;node_type:string;parent_key:string}[]>([]);
 const latest=templates.filter(t=>!templates.some(other=>other.templateId===t.templateId && other.version>t.version));
 return <div className="grid gap-3"><label>Template to publish<select className={input} value={selection} onChange={e=>{setSelection(e.target.value);setNodes((templates.find(t=>t.id===e.target.value)?.checklistNodes??[]).map(n=>({...n,parent_key:n.parent_key??''})));}}><option value="">New template</option>{latest.map(t=><option key={t.id} value={t.id}>{t.name} · version {t.version}</option>)}</select></label>
 {selected?.requiresReview?<div className="border-border rounded-xl border p-3 text-sm"><p>Legacy template retained for review. Publish a new version with explicit sections; the original stays unchanged.</p><p className="whitespace-pre-wrap">{selected.legacyDescription}</p>{selected.legacyNodes?.map((n,i)=><p key={i}>{n.node_type}: {n.title} {n.description}</p>)}</div>:null}
 <ExecutionForm key={selection} action={publishNativeTemplate} scope={'publishTemplate:'+selection}>
 <input type="hidden" name="templateId" value={selected?.templateId??''}/><input type="hidden" name="templateVersion" value={selected?.version??0}/>
 <label>Name<input name="templateName" className={input} defaultValue={selected?.name??''} readOnly={Boolean(selected)} required/></label>
 <p className="text-sm">Instructions guide editing; they do not populate completed task content. Publishing creates a new version. Existing instances stay independent.</p>
 {DETAIL_FIELDS.map(f=><label key={f.key}>{f.label} instruction<textarea className={input} name={'instruction_'+f.key} defaultValue={selected?.instructions[f.key]??''}/></label>)}
 <input type="hidden" name="checklistNodes" value={JSON.stringify(nodes.map(n=>({...n,parent_key:n.parent_key||null})))}/>
 {nodes.map((n,i)=><div key={n.key} className="border-border grid gap-2 rounded-xl border p-3"><label>Checklist item<input className={input} required value={n.title} onChange={e=>setNodes(nodes.map((x,j)=>j===i?{...x,title:e.target.value}:x))}/></label><label>Section<select className={input} value={n.section} onChange={e=>setNodes(nodes.map((x,j)=>j===i?{...x,section:e.target.value,parent_key:''}:x))}>{['setup','activity','closure'].map(s=><option key={s}>{s}</option>)}</select></label><label>Node type<select className={input} value={n.node_type} onChange={e=>setNodes(nodes.map((x,j)=>j===i?{...x,node_type:e.target.value}:x))}>{['Item','Group','Page'].map(s=><option key={s}>{s}</option>)}</select></label><label>Parent<select className={input} value={n.parent_key} onChange={e=>setNodes(nodes.map((x,j)=>j===i?{...x,parent_key:e.target.value}:x))}><option value="">Section root</option>{nodes.slice(0,i).filter(x=>x.section===n.section).map(x=><option key={x.key} value={x.key}>{x.title||'Untitled item'}</option>)}</select></label></div>)}
 <button className={`${buttonVariants({ variant: 'outline' })} justify-self-start`} type="button" onClick={()=>setNodes([...nodes,{key:'node'+(nodes.length+1),title:'',section:'activity',node_type:'Item',parent_key:''}])}>Add checklist item</button><button className={`${buttonVariants()} justify-self-start`} type="submit">Publish template version</button>
 </ExecutionForm></div>;
}
