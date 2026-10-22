'use client';
import { useState } from 'react';
import { changeTaskLifecycle } from '@/modules/tasks/actions';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { Button } from '@/shared/ui/button';
import type { Task } from '@/types/tracker';
import { RefreshCwIcon } from 'lucide-react';
import { codeLabel } from '@/shared/tracker/labels';
import { HelpTip } from '@/shared/ui/help-tip';

const control='field mt-1 block w-full';

export function TaskLifecyclePanel({ task }: { task: Task }) {
 const [mode,setMode]=useState(task.scaleMode ?? 'manual');
 const identity = <><input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="expectedVersion" value={task.lifecycleVersion ?? 0} /></>;
 const field=(label:string,name:string,value?:number|null)=><label className="text-sm font-medium">{label}<input type="number" name={name} min="0" step="any" defaultValue={value ?? ''} required className={control} /></label>;
 return <section className="soft-card grid gap-4 p-5 sm:p-6">
  <h2 className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight"><RefreshCwIcon className="text-primary size-5" aria-hidden="true" />Lifecycle and scale</h2>
  <p className="text-muted-foreground flex flex-wrap items-center text-sm">Scale: {codeLabel(task.scaleMode ?? 'manual')}{task.scaleProvenance ? ` (${task.scaleProvenance})` : ''}. Credit already earned keeps the scale it was earned at.<HelpTip tip="scale" /></p>
  <div className="grid gap-4 xl:grid-cols-2">
  <ExecutionForm action={form=>changeTaskLifecycle(null,form)} scope="transition" className="bg-muted/70 grid content-start gap-3 rounded-xl p-4">
   {identity}<input type="hidden" name="command" value="transition" />
   <label className="text-sm font-medium">Status<select name="status" className={control} defaultValue="In Progress"><option>In Progress</option><option>Done</option><option>Not Started</option><option>Discarded</option><option>Stopped</option><option>On-Hold</option><option>Carryover</option></select></label>
   <label className="text-sm font-medium">Reason<input name="reason" className={control} required maxLength={1000} /></label>
   <Button type="submit" size="sm" className="justify-self-start">Save lifecycle change</Button>
   <p className="text-muted-foreground text-xs">Done needs Setup, Activity and Closure complete, matching progress and the assigned reviewers’ approval.</p>
  </ExecutionForm>
  <ExecutionForm action={form=>changeTaskLifecycle(null,form)} scope="scale" className="bg-muted/70 grid content-start gap-3 rounded-xl p-4">
   {identity}<input type="hidden" name="command" value="scale" />
   <label className="text-sm font-medium">Scale mode<select name="mode" className={control} value={mode} onChange={event=>setMode(event.target.value)}><option value="manual">Manual</option><option value="hours">Logged hours × 12.5 × multiplier</option><option value="activity_count">Numeric activity count × unit scale</option><option value="linked">Linked task scale × percentage</option></select></label>
   {mode==='manual' ? field('Manual value','value',task.taskScale) : null}
   {mode==='hours' ? field('Hours multiplier','multiplier') : null}
   {mode==='activity_count' ? <>{field('Numeric activity count','activityCount')}{field('Scale per activity','unitScale')}<p className="text-muted-foreground text-xs">Enter the count from the source activity register. Automatic checklist counting is not yet available.</p></> : null}
   {mode==='linked' ? <><label className="text-sm font-medium">Source task tag<input name="sourceTaskTag" required className={control} /></label>{field('Linked percentage','percentage')}</> : null}
   <label className="text-sm font-medium">Override (blank uses formula; zero is valid)<input type="number" name="override" min="0" step="any" defaultValue={task.scaleOverride ?? ''} className={control} /></label>
   <label className="text-sm font-medium">Source/provenance<input name="provenance" required maxLength={1000} className={control} /></label>
   <label className="text-sm font-medium">Reason<input name="reason" required maxLength={1000} className={control} /></label>
   <Button type="submit" size="sm" className="justify-self-start">Save prospective scale</Button>
  </ExecutionForm>
  </div>
 </section>;
}
