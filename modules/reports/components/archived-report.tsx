import { buttonVariants } from '@/shared/ui/button';
import Link from 'next/link';
import { displayPerformance } from '@/shared/math/exact';
import { archiveDifferences,type MonthArchive } from '@/modules/reports/internal/month/archive';
import { FACTORS } from '@/modules/scoring/client';
import { cn } from '@/shared/utils';
import { codeLabel, codeLabels } from '@/shared/tracker/labels';
import { FACTOR_LABELS } from '@/modules/scoring/client';
import { EvidenceTable } from './evidence-table';

export function ArchivedReport({archive,previous,employee}:{archive:MonthArchive;previous:MonthArchive|null;employee:string|null}){
 const selected=employee?archive.members.filter(m=>m.userId===employee):archive.members;
 const difference=previous?archiveDifferences(previous,archive):null;
 const changes=difference?.members.filter(m=>!employee||m.userId===employee)??[];
 const base=`/api/reports/export?period=${archive.period.slice(0,7)}&revision=${archive.revisionNumber}${employee?'&employee='+encodeURIComponent(employee):''}`;
 const presentation=archive.presentationInputs&&typeof archive.presentationInputs==='object'&&!Array.isArray(archive.presentationInputs)?archive.presentationInputs:{};
 const list=(key:string):Record<string,unknown>[]=>Array.isArray(presentation[key])?(presentation[key] as Record<string,unknown>[]):[];
 const sourceRows=archive.sourceInputs&&typeof archive.sourceInputs==='object'&&!Array.isArray(archive.sourceInputs)&&Array.isArray(archive.sourceInputs.members)?archive.sourceInputs.members as Record<string,unknown>[]:[];
 const names=new Map(sourceRows.map(row=>[String(row.id??row.userId),String(row.full_name??row.fullName??row.name??'Team member')]));
 const name=(id:string|null)=>id?names.get(id)??'Team member':'No winner';
 return <section className="soft-card grid gap-4 p-5 sm:p-6" aria-label="Archived report">
  <h2 className="text-foreground text-base font-bold tracking-tight">Revision {archive.revisionNumber} · {codeLabel(archive.disposition)} · {codeLabel(archive.certification)}</h2>
  <p className="text-muted-foreground text-sm">Figures as of {new Date(archive.asOf).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})} (India time).</p>
  {archive.superseded?<p role="status" className="bg-attention-subtle text-attention-foreground rounded-xl px-3 py-2 text-sm">A later revision replaced this one; it stays readable.</p>:null}
  {archive.dataQualityReasons.length?<p role="status" className="bg-attention-subtle text-attention-foreground rounded-xl px-3 py-2 text-sm">Missing when closed: {codeLabels(archive.dataQualityReasons)}</p>:null}
  <p className="text-sm">Star of the month: {archive.certification==='certified'?name(archive.monthlySelection.winnerId):'not decided, because the month closed with gaps'}.</p>
  <nav aria-label="Archived downloads" className="flex flex-wrap gap-2">{['json','text','csv'].map(format=><a className={cn(buttonVariants({ variant: 'outline' }), 'h-9 px-3')} href={`${base}&format=${format}`} key={format}>Download {format.toUpperCase()}</a>)}</nav>
  {selected.map(({userId,result})=><section key={userId} className="grid gap-2"><h3 className="text-foreground text-sm font-semibold">{name(userId)} · {codeLabel(result.status)} · score {result.compositeExact?displayPerformance(result.compositeExact,2):'Unavailable'}</h3><div className="border-border overflow-x-auto rounded-xl border"><table className="sheet-grid w-full min-w-[40rem]"><thead><tr><th>Factor</th><th>Value</th><th>Team median</th><th>Difference</th><th>Weighted</th><th>Why unavailable</th></tr></thead><tbody>{FACTORS.map(f=>{const v=result.factors[f];return <tr key={f}><th>{FACTOR_LABELS[f]}</th><td>{displayPerformance(v.rawExact)}</td><td>{displayPerformance(v.medianExact)}</td><td>{displayPerformance(v.deltaExact)}</td><td>{displayPerformance(v.contributionExact)}</td><td>{codeLabels(v.reasons)||'—'}</td></tr>;})}</tbody></table></div></section>)}
  <details className="disclosure"><summary>Missions, time, attendance and contributions kept with this revision</summary><p className="text-muted-foreground text-sm">{list('tasks').length} missions · {list('logs').length} time logs · {list('attendance').length} attendance summaries · {list('contributions').length} contributions · {list('assets').length} links.</p><div className="border-border overflow-x-auto rounded-xl border"><table className="sheet-grid w-full"><thead><tr><th>Mission</th><th>Title</th><th>Status</th><th>Progress</th></tr></thead><tbody>{list('tasks').map((t,i)=><tr key={String(t.id??i)}><td>{String(t.task_tag??'—')}</td><td>{String(t.title??'—')}</td><td>{String(t.status??'—')}</td><td>{t.progress_percentage==null?'—':`${String(t.progress_percentage)}%`}</td></tr>)}</tbody></table></div>{([['logs','Time logs'],['contributions','Contributions'],['checklists','Checklist sections'],['assets','Links']] as const).map(([key,label])=><div key={key} className="grid gap-1.5"><h3 className="text-foreground text-sm font-semibold">{label}</h3><EvidenceTable rows={list(key)} label={label}/></div>)}</details>
  {previous&&difference?<details className="disclosure"><summary>Changes from revision {previous.revisionNumber}</summary><ul className="grid list-disc gap-1 pl-5 text-sm">{changes.map(c=><li key={c.userId}>{name(c.userId)}: {codeLabel(c.oldStatus)} → {codeLabel(c.newStatus)}; score {c.oldScore?displayPerformance(c.oldScore,2):'Unavailable'} → {c.newScore?displayPerformance(c.newScore,2):'Unavailable'}; changed factors {c.changedFactors.map(f=>FACTOR_LABELS[f as keyof typeof FACTOR_LABELS]??f).join(', ')||'none'}</li>)}</ul><p>Status: {codeLabel(difference.certification.before)} → {codeLabel(difference.certification.after)}. Missing inputs: {codeLabels(difference.availability.before)||'none'} → {codeLabels(difference.availability.after)||'none'}.</p><p>Changed award dates: {difference.changedAwardDates.join(', ')||'none'}. Daily-star count changes: {difference.awardCounts.map(c=>`${name(c.userId)} ${c.before} → ${c.after}`).join(', ')||'none'}.</p><p>Changed records: {difference.sourceComparisonAvailable?difference.changedSources.length||'none':'visible to managers only'}.</p></details>:null}
  <Link className="link justify-self-start" href={`/reports?period=${archive.period.slice(0,7)}`}>Back to the live month</Link>
 </section>;
}
