'use client';
import { useState } from 'react';
import { changeTaskLifecycle } from '@/app/tasks/actions';
import { ExecutionForm } from '@/components/tasks/execution-form';
import { Button } from '@/components/ui/button';
import type { Task } from '@/types/tracker';

export function TaskLifecyclePanel({ task }: { task: Task }) {
 const [mode,setMode]=useState(task.scaleMode ?? 'manual');
 const identity = <><input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="expectedVersion" value={task.lifecycleVersion ?? 0} /></>;
 const field=(label:string,name:string,value?:number|null)=><label className="text-sm">{label}<input type="number" name={name} min="0" step="any" defaultValue={value ?? ''} required className="block w-full rounded border p-2" /></label>;
 return <section className="soft-card grid gap-4 p-4">
  <h3 className="font-semibold">Lifecycle and scale</h3>
  <p className="text-sm">Scale: {task.scaleMode ?? 'manual'}. Source: {task.scaleProvenance ?? 'Legacy stored value'}. Earlier earned credit is preserved when scale or shares change.</p>
  <ExecutionForm action={form=>changeTaskLifecycle(null,form)} scope="transition">
   {identity}<input type="hidden" name="command" value="transition" />
   <label className="text-sm">Status<select name="status" className="block w-full rounded border p-2" defaultValue="In Progress"><option>In Progress</option><option>Done</option><option>Not Started</option><option>Discarded</option><option>Stopped</option><option>On-Hold</option><option>Carryover</option></select></label>
   <label className="text-sm">Reason<input name="reason" className="block w-full rounded border p-2" required maxLength={1000} /></label>
   <Button type="submit" size="sm">Save lifecycle change</Button>
   <p className="text-sm text-slate-600">Done requires initialized Setup, Activity and Closure, consistent progress and current assigned-reviewer approvals.</p>
  </ExecutionForm>
  <ExecutionForm action={form=>changeTaskLifecycle(null,form)} scope="scale">
   {identity}<input type="hidden" name="command" value="scale" />
   <label className="text-sm">Scale mode<select name="mode" className="block w-full rounded border p-2" value={mode} onChange={event=>setMode(event.target.value)}><option value="manual">Manual</option><option value="hours">Logged hours × 12.5 × multiplier</option><option value="activity_count">Numeric activity count × unit scale</option><option value="linked">Linked task scale × percentage</option></select></label>
   {mode==='manual' ? field('Manual value','value',task.taskScale) : null}
   {mode==='hours' ? field('Hours multiplier','multiplier') : null}
   {mode==='activity_count' ? <>{field('Numeric activity count','activityCount')}{field('Scale per activity','unitScale')}<p className="text-sm text-slate-600">Enter the count from the source activity register. Automatic checklist counting is not yet available.</p></> : null}
   {mode==='linked' ? <><label className="text-sm">Source task tag<input name="sourceTaskTag" required className="block w-full rounded border p-2" /></label>{field('Linked percentage','percentage')}</> : null}
   <label className="text-sm">Override (blank uses formula; zero is valid)<input type="number" name="override" min="0" step="any" defaultValue={task.scaleOverride ?? ''} className="block w-full rounded border p-2" /></label>
   <label className="text-sm">Source/provenance<input name="provenance" required maxLength={1000} className="block w-full rounded border p-2" /></label>
   <label className="text-sm">Reason<input name="reason" required maxLength={1000} className="block w-full rounded border p-2" /></label>
   <Button type="submit" size="sm">Save prospective scale</Button>
  </ExecutionForm>
 </section>;
}
