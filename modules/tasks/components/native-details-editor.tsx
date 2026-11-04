import { buttonVariants } from '@/shared/ui/button';
import Link from 'next/link';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { initializeTaskDetails,saveTaskDetails,addTaskRelation } from '@/modules/tasks/detail-actions';
import { DETAIL_FIELDS,detailValues,type NativeTemplate } from '@/modules/tasks/internal/details-contract';
import type { Task,TaskDetailSection } from '@/types/tracker';
import { cn } from '@/shared/utils';
const input='field w-full';
export function NativeTemplateSelect({templates}: {templates:readonly NativeTemplate[]}) {
 return <label className="grid gap-1.5 text-sm font-medium">Template<select name="templateVersionId" className={input} defaultValue=""><option value="">Blank mission</option>{templates.filter(t=>t.name!=='Blank native task').map(t=><option key={t.id} value={t.id} disabled={t.requiresReview}>{t.name} · version {t.version}{t.requiresReview?' · legacy review required':''}</option>)}</select></label>;
}
export function InitializeDetailsForm({task,templates}: {task:Task;templates:readonly NativeTemplate[]}) {
 return <ExecutionForm action={initializeTaskDetails} scope={'initializeDetails:'+task.id}><input type="hidden" name="taskId" value={task.id}/><input type="hidden" name="expectedVersion" value={task.lifecycleVersion??0}/><NativeTemplateSelect templates={templates}/><button className={cn(buttonVariants(), 'justify-self-start')} type="submit">Set up mission details</button></ExecutionForm>;
}
/** Mission details text (including the Input / Process / Output descriptions) and related missions. Files and links live in the Files panel on the Work tab. */
export function NativeDetailsEditor({task,sections,tasks}: {task:Task;sections:readonly TaskDetailSection[];tasks:readonly Pick<Task,'id'|'taskTag'|'title'>[]}) {
 const values=detailValues(sections);
 const identity=<><input type="hidden" name="taskId" value={task.id}/><input type="hidden" name="expectedVersion" value={task.lifecycleVersion??0}/></>;
 return <div className="grid gap-4">
 <ExecutionForm action={saveTaskDetails} scope={'saveDetails:'+task.id}>
 {identity}{DETAIL_FIELDS.map(f=><label key={f.key} className="grid gap-1 text-sm">{f.label}<textarea name={f.key} defaultValue={values[f.key]} className={input}/></label>)}<button className={cn(buttonVariants(), 'justify-self-start')} type="submit">Save structured details</button>
 </ExecutionForm>
 <ExecutionForm action={addTaskRelation} scope={'addRelation:'+task.id}>{identity}
 <label>Related task<select name="otherTaskId" className={input} required><option value="">Select task</option>{tasks.filter(t=>t.id!==task.id).map(t=><option key={t.id} value={t.id}>{t.taskTag} · {t.title}</option>)}</select></label>
 <label>Relationship<select name="relationType" className={input}>{['Dependency','Carryover','Related'].map(r=><option key={r}>{r}</option>)}</select></label>
 <label>Notes<textarea name="notes" className={input}/></label><button className={cn(buttonVariants(), 'justify-self-start')} type="submit">Save relationship</button>
 </ExecutionForm><Link href="/task-tools">Manage native templates in Task Tools</Link></div>;
}
