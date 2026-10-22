import * as React from 'react';
import type { ContributionInputContext } from '../internal/input-context';
import Link from 'next/link';
import { writeDatedRecord } from '@/modules/records/actions';
import { MeetingTypeSelect } from '@/modules/settings/components/meeting-type-select';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { Button } from '@/shared/ui/button';
import { InfoIcon, PlusIcon } from 'lucide-react';
import { InitialsAvatar, EmptyState, MissionNotice, MissionPanel } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';
import { kolkataDate } from '@/shared/time/kolkata';
import { formatDate, formatDateTime } from '@/shared/tracker/format';
import { codeLabel } from '@/shared/tracker/labels';
import { HelpTip } from '@/shared/ui/help-tip';
import { canManageSupportRecords, canValidateSupportRecord } from '../internal/permissions';
import type { RecordKind, DatedRecordMetadata } from '../internal/contract';
import type { User } from '@/types/tracker';

export interface DatedEntry extends DatedRecordMetadata {
  id:string; businessDate:string; authorId:string|null; content:string|null; assetUrl:string|null;
  extras?:Record<string,string|boolean|null>;
}
export interface TaskChoice {id:string;tag:string;title:string}

/** The member fields the editor reads; the quick Post drawer sends only these. */
export type RecordMember=Pick<User,'id'|'fullName'|'isActive'>;

export function DatedRecordEditor({kind,entry,members,user,tasks=[],presetTaskId,autoFocus,onSaved,submitLabel='Add record'}:{kind:RecordKind;entry?:DatedEntry;members:readonly RecordMember[];user:Pick<User,'id'|'role'>;tasks?:readonly TaskChoice[];
  /** Preselects the related task of a new record (quick Post from a mission). */
  presetTaskId?:string;
  /** Focuses the content field on mount, e.g. when the drawer opens. */
  autoFocus?:boolean;
  /** Runs after a successful save (the drawer closes and toasts). */
  onSaved?:()=>void;
  /** Label of a new record's save button. */
  submitLabel?:string}) {
  const admin=canManageSupportRecords(user.role);
  const extra=entry?.extras??{};
  const text=(label:string,name:string,required=false)=><label className="field-label">{label}<input name={name} defaultValue={String(extra[name]??'')} required={required} className="field"/></label>;
  return <ExecutionForm action={writeDatedRecord} scope={`dated:${kind}:${entry?.id??'new'}`} className="grid gap-3" onSuccess={onSaved}>
    <input type="hidden" name="kind" value={kind}/><input type="hidden" name="command" value="save"/>
    <input type="hidden" name="recordId" value={entry?.id??''}/><input type="hidden" name="expectedVersion" value={entry?.recordVersion??0}/>
    <label className="field-label">Date<input type="date" name="business_date" defaultValue={entry?.businessDate??kolkataDate()} required className="field"/></label>
    {admin?<label className="field-label">Author<select name="author_id" required defaultValue={entry?(entry.authorId??''):user.id} className="field"><option value="" disabled>Choose an author explicitly</option>{entry?.authorId&&!members.some(m=>m.id===entry.authorId&&m.isActive)?<option value={entry.authorId} disabled>Former or unknown author: choose who wrote it</option>:null}{members.filter(m=>m.isActive).map(m=><option key={m.id} value={m.id}>{m.fullName}</option>)}</select></label>:<input type="hidden" name="author_id" value={user.id}/>}
    <label className="field-label">{kind==='sale'?'Notes':'Content'}<textarea name="content" defaultValue={entry?.content??''} required={kind!=='sale'} autoFocus={autoFocus} className="field min-h-24"/></label>
    <label className="field-label">Asset link<input name="asset_url" type="url" defaultValue={entry?.assetUrl??''} placeholder="https://..." className="field"/></label>
    <label className="field-label">Related task<select name="related_task_id" defaultValue={entry?entry.relatedTaskId??'':presetTaskId??''} className="field"><option value="">No task relationship</option>{tasks.map(t=><option key={t.id} value={t.id}>{t.tag} - {t.title}</option>)}</select></label>
    {kind==='sale'?<>{text('Built-up area (source text; not used in scoring)','project_built_up_area')}{text('Project location','project_location')}{text('Client name','client_name')}<label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="is_new_project" defaultChecked={extra.is_new_project===true}/> New project</label><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="basement_payment_received" defaultChecked={extra.basement_payment_received===true}/> Basement payment received</label></>:null}
    {kind==='meeting'?<><MeetingTypeSelect defaultValue={entry?String(extra.meeting_type??''):undefined}/><label className="field-label">Point type<select name="point_type" defaultValue={String(entry?(extra.point_type??''):'General Point')} className="field"><option value="">Not classified</option>{['Blocking Issue','Concern','Lessons Learned','Work Improvement','General Point'].map(t=><option key={t}>{t}</option>)}</select></label><label className="field-label">To be resolved by<select name="owner_id" defaultValue={String(entry?(extra.owner_id??''):user.id)} className="field"><option value="">No owner yet</option>{extra.owner_id&&!members.some(m=>m.id===extra.owner_id&&m.isActive)?<option value={String(extra.owner_id)} disabled>Retained inactive/missing owner</option>:null}{members.filter(m=>m.isActive).map(m=><option key={m.id} value={m.id}>{m.fullName}</option>)}</select></label>{text('Resolution','resolution')}{text('Comments','comments')}<label className="field-label">Resolution status<select name="resolution_status" defaultValue={String(entry?(extra.resolution_status??''):'Not Started')} className="field"><option value="">Status not recorded</option>{['Not Started','In Progress','Discarded','Done'].map(s=><option key={s}>{s}</option>)}</select></label><label className="field-label">Resolution due<input type="date" name="resolution_due" defaultValue={String(extra.resolution_due??'')} className="field"/></label><label className="field-label">Resolved on<input type="date" name="resolved_on" defaultValue={String(extra.resolved_on??'')} className="field"/></label></>:null}
    {entry?<label className="field-label">Correction reason<input name="reason" required maxLength={1000} className="field"/></label>:null}
    <Button type="submit" className="justify-self-start">{entry?'Save correction':submitLabel}</Button>
  </ExecutionForm>;
}

export function DatedRecordModule({kind,entries,members,user,tasks=[],inputContext}:{kind:RecordKind;entries:readonly DatedEntry[];members:readonly User[];user:User;tasks?:readonly TaskChoice[];inputContext?:ContributionInputContext}) {
  const admin=canManageSupportRecords(user.role),names=new Map(members.map(m=>[m.id,m.fullName]));
  return <div className="grid gap-5 lg:gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]"><aside className="h-fit"><MissionPanel icon={PlusIcon} title={`Add ${kind}`}><DatedRecordEditor kind={kind} members={members} user={user} tasks={tasks}/></MissionPanel></aside><main className="grid min-w-0 content-start gap-4">
    <MissionNotice icon={InfoIcon}>{kind==='meeting'?'Meeting points keep the team’s decisions and owners; they are not part of the score.':<>{kind==='sale'?'Each sale counts, with extra for new projects and basement payments; rejected and withdrawn entries do not.':'Entries count once saved and count more once someone else validates them; rejected and withdrawn entries do not.'} <HelpTip tip="pending"/></>}</MissionNotice>
    {inputContext&&kind!=='meeting'?<section className="soft-card grid gap-2 p-5 text-sm sm:p-6"><h2 className="text-foreground text-base font-bold tracking-tight">Credit from {formatDate(inputContext.periodStart)} to {formatDate(new Date(Date.parse(`${inputContext.periodEndExclusive}T00:00:00Z`)-86_400_000).toISOString().slice(0,10))}</h2><p className="text-muted-foreground">Scores compare each person’s credit with the team median. <HelpTip tip="medianDifference"/></p><div className="border-border mt-1 overflow-x-auto rounded-xl border"><table className="sheet-grid w-full"><thead><tr><th>Member</th><th>Validated</th><th>Waiting for review</th><th>Credit</th></tr></thead><tbody>{inputContext.employeeFactors.filter(e=>e.userId===user.id||e.factors[kind].validatedCount+e.factors[kind].eligibleUnvalidatedCount>0||!e.factors[kind].available).map(e=>{const f=e.factors[kind];return <tr key={e.userId}><td>{names.get(e.userId)??'Unknown'}</td><td>{f.validatedCount}</td><td>{f.eligibleUnvalidatedCount}</td><td>{f.available?f.rawValue:'Unavailable'}{kind==='sale'&&f.salesCounts?<p className="text-muted-foreground">{f.salesCounts.BN} entries, {f.salesCounts.BO} new projects, {f.salesCounts.BP} basement payments</p>:null}{f.reasons.length?<p>{f.reasons.includes('sales_flags_missing')?'A sales entry is missing its new-project or basement flag.':f.reasons.includes('sales_field_mapping_missing')?'Sales were not mapped when this was recorded.':'Older entries need review before they count.'}</p>:null}</td></tr>;})}</tbody></table></div></section>:null}
    {entries.length===0?<EmptyState>No records in this period.</EmptyState>:entries.map(e=><article key={e.id} className="soft-card grid gap-2 p-5 sm:p-6"><p className="text-muted-foreground flex flex-wrap items-center gap-x-1 text-sm"><InitialsAvatar name={e.authorId?names.get(e.authorId)??'?':'?'} className="mr-1.5 size-7 text-[10px]"/>{formatDate(e.businessDate)} · {e.authorId?names.get(e.authorId)??'Former member':'Author not known yet'}</p><p className="text-foreground text-[15px] leading-relaxed whitespace-pre-wrap">{e.content}</p><p className={cn('badge-soft justify-self-start',e.validationState==='validated'?'badge-status-done':e.validationState==='rejected'?'bg-danger-subtle text-danger-foreground':e.validationState==='withdrawn'?'badge-status-discarded':e.validationState==='pending'?'badge-status-in-progress':'badge-neutral')}>{codeLabel(e.validationState??'legacy_unvalidated')}{e.validationAt?` · reviewed ${formatDateTime(e.validationAt)}`:''}</p>{e.validatorId?<p className="text-muted-foreground text-sm">Validator: {names.get(e.validatorId)??'Unknown'}</p>:null}{e.validationState==='validated'&&!e.validationAt?<p className="text-sm">Validated in the earlier tracker; when is not known.</p>:null}{e.validationReason?<p className="text-sm">Review reason: {e.validationReason}</p>:null}
      {e.assetUrl&&/^https?:\/\//.test(e.assetUrl)?<Link href={e.assetUrl} target="_blank" className="link justify-self-start text-sm">Open asset</Link>:e.assetUrl?<p>The saved link is not a web address; correct the record to fix it.</p>:null}
      {e.relatedTaskId?<p className="text-muted-foreground text-sm">Related task: {tasks.find(t=>t.id===e.relatedTaskId)?.tag??'Reference unavailable'}</p>:null}
      {kind==='sale'&&e.extras?<p className="text-muted-foreground text-sm">Built-up area: {e.extras.project_built_up_area??'Unspecified'}; new project: {e.extras.is_new_project?'Yes':'No'}; basement payment: {e.extras.basement_payment_received?'Yes':'No'}</p>:null}
      {kind==='meeting'&&e.extras?<MeetingFacts extras={e.extras} owner={names.get(String(e.extras.owner_id))}/>:null}
      {(admin&&e.validationState!=='withdrawn')||(!admin&&e.authorId===user.id&&e.validationState==='pending')?<details className="disclosure"><summary>Correct record</summary><DatedRecordEditor kind={kind} entry={e} members={members} user={user} tasks={tasks}/></details>:null}
      {admin&&e.validationState!=='withdrawn'&&canValidateSupportRecord(user,e.authorId)?<ExecutionForm action={writeDatedRecord} scope={`validate:${kind}:${e.id}`} className="border-border grid gap-2 border-t pt-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-end"><input type="hidden" name="kind" value={kind}/><input type="hidden" name="command" value="validate"/><input type="hidden" name="recordId" value={e.id}/><input type="hidden" name="expectedVersion" value={e.recordVersion??0}/><label className="field-label">Review decision<select name="state" defaultValue="validated" className="field"><option value="validated">Validated</option><option value="rejected">Rejected</option><option value="pending">Back to waiting for review</option></select></label><input name="reason" required placeholder="Why? (kept with the history)" aria-label="Why this review" className="field"/><Button type="submit" size="sm">Save review</Button></ExecutionForm>:null}
      {(admin||e.authorId===user.id&&e.validationState==='pending')&&e.validationState!=='withdrawn'?<ExecutionForm action={writeDatedRecord} scope={`withdraw:${kind}:${e.id}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><input type="hidden" name="kind" value={kind}/><input type="hidden" name="command" value="withdraw"/><input type="hidden" name="recordId" value={e.id}/><input type="hidden" name="expectedVersion" value={e.recordVersion??0}/><input name="reason" required placeholder="Why withdraw it? (kept with the history)" aria-label="Why withdraw it? (kept with the history)" className="field"/><Button type="submit" size="sm" variant="destructive">Withdraw record</Button></ExecutionForm>:null}
      {admin&&['validated','rejected'].includes(e.validationState??'')?<p className="text-muted-foreground text-xs">Saving a correction resets this reviewed entry to Pending. Its earlier content and review remain in history.</p>:null}
      {e.authorId===user.id||admin?<Link href={`/records/${kind}/${e.id}/history`} className="link justify-self-start text-sm">View history</Link>:null}
    </article>)}
  </main></div>;
}

/** A meeting point's details; rows with nothing recorded are left out. */
function MeetingFacts({extras,owner}:{extras:Record<string,string|boolean|null>;owner?:string}) {
  const text=(key:string)=>{const v=extras[key];return typeof v==='string'&&v.trim()?v:null;};
  const type=[text('meeting_type'),text('point_type')].filter(Boolean).join(' / ');
  const resolution=[text('resolution_status'),text('resolution')].filter(Boolean).join(': ');
  const dates=[text('resolution_due')&&`due ${text('resolution_due')}`,text('resolved_on')&&`resolved ${text('resolved_on')}`].filter(Boolean).join(', ');
  const rows:[string,string|null][]=[['Meeting / point type',type||null],['Owner',owner??'Unassigned'],['Resolution',resolution||null],['Dates',dates||null],['Comments',text('comments')]];
  return <dl className="bg-muted/70 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-xl px-4 py-3 text-sm [&>dt]:text-muted-foreground [&>dd]:text-foreground">{rows.filter(([,v])=>v).map(([k,v])=><React.Fragment key={k}><dt>{k}</dt><dd className="break-words">{v}</dd></React.Fragment>)}</dl>;
}
