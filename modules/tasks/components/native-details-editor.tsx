import { buttonVariants } from '@/shared/ui/button';
import Link from 'next/link';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { initializeTaskDetails,saveTaskDetails,addTaskAsset,addTaskRelation } from '@/modules/tasks/detail-actions';
import { DETAIL_FIELDS,IPO_ROLES,detailValues,type NativeTemplate } from '@/modules/tasks/internal/details-contract';
import type { Task,TaskDetailSection,User } from '@/types/tracker';
import { cn } from '@/shared/utils';
const input='field w-full';
export function NativeTemplateSelect({templates}: {templates:readonly NativeTemplate[]}) {
 return <label className="grid gap-1.5 text-sm font-medium">Template<select name="templateVersionId" className={input} defaultValue=""><option value="">Blank native task (version 1)</option>{templates.filter(t=>t.name!=='Blank native task').map(t=><option key={t.id} value={t.id} disabled={t.requiresReview}>{t.name} · version {t.version}{t.requiresReview?' · legacy review required':''}</option>)}</select></label>;
}
export function InitializeDetailsForm({task,templates}: {task:Task;templates:readonly NativeTemplate[]}) {
 return <ExecutionForm action={initializeTaskDetails} scope={'initializeDetails:'+task.id}><input type="hidden" name="taskId" value={task.id}/><input type="hidden" name="expectedVersion" value={task.lifecycleVersion??0}/><NativeTemplateSelect templates={templates}/><button className={cn(buttonVariants(), 'justify-self-start')} type="submit">Initialize native details</button></ExecutionForm>;
}
export function NativeDetailsEditor({task,sections,tasks,members,reports}: {task:Task;sections:readonly TaskDetailSection[];tasks:readonly Task[];members:readonly User[];reports:readonly {id:string;title:string}[]}) {
 const values=detailValues(sections);
 const identity=<><input type="hidden" name="taskId" value={task.id}/><input type="hidden" name="expectedVersion" value={task.lifecycleVersion??0}/></>;
 return <div className="grid gap-4">
 <ExecutionForm action={saveTaskDetails} scope={'saveDetails:'+task.id}>
 {identity}{DETAIL_FIELDS.map(f=><label key={f.key} className="grid gap-1 text-sm">{f.label}<textarea name={f.key} defaultValue={values[f.key]} className={input}/></label>)}<button className={cn(buttonVariants(), 'justify-self-start')} type="submit">Save structured details</button>
 </ExecutionForm>
 <ExecutionForm action={addTaskAsset} scope={'addAsset:'+task.id}>{identity}
 <label>IPO role<select name="ipoRole" className={input}>{IPO_ROLES.map(r=><option key={r} value={r}>{r}</option>)}</select></label>
 <label>Asset type<select name="linkType" className={input}>{['Folder','Document','Account','Flowchart','Engineering','Drawing','Checklist','Raw Link','Other'].map(t=><option key={t}>{t}</option>)}</select></label>
 <label>Label<input name="label" className={input} required maxLength={120}/></label><label>Asset URL<input name="url" type="url" className={input}/></label>
 <label>Related employee<select name="employeeId" className={input}><option value="">None</option>{members.map(m=><option key={m.id} value={m.id}>{m.fullName}</option>)}</select></label>
 <label>Related report<select name="reportId" className={input}><option value="">None</option>{reports.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select></label><label>Notes<textarea name="notes" className={input}/></label>
 <p className="text-sm text-muted-foreground">Choose an asset URL or one related employee/report. Saving a link does not create a Drive file.</p><button className={cn(buttonVariants(), 'justify-self-start')} type="submit">Add link</button>
 </ExecutionForm>
 <ExecutionForm action={addTaskRelation} scope={'addRelation:'+task.id}>{identity}
 <label>Related task<select name="otherTaskId" className={input} required><option value="">Select task</option>{tasks.filter(t=>t.id!==task.id).map(t=><option key={t.id} value={t.id}>{t.taskTag} · {t.title}</option>)}</select></label>
 <label>Relationship<select name="relationType" className={input}>{['Dependency','Carryover','Related'].map(r=><option key={r}>{r}</option>)}</select></label>
 <label>Notes<textarea name="notes" className={input}/></label><button className={cn(buttonVariants(), 'justify-self-start')} type="submit">Save relationship</button>
 </ExecutionForm><Link href="/task-tools">Manage native templates in Task Tools</Link></div>;
}
