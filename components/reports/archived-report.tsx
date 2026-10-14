import Link from 'next/link';
import { displayPerformance } from '@/lib/performance/exact';
import { archiveDifferences,type MonthArchive } from '@/lib/month/archive';
import { FACTORS } from '@/lib/performance/engine';

export function ArchivedReport({archive,previous,employee}:{archive:MonthArchive;previous:MonthArchive|null;employee:string|null}){
 const selected=employee?archive.members.filter(m=>m.userId===employee):archive.members;
 const difference=previous?archiveDifferences(previous,archive):null;
 const changes=difference?.members.filter(m=>!employee||m.userId===employee)??[];
 const base=`/api/reports/export?period=${archive.period.slice(0,7)}&revision=${archive.revisionNumber}${employee?'&employee='+encodeURIComponent(employee):''}`;
 const presentation=archive.presentationInputs&&typeof archive.presentationInputs==='object'&&!Array.isArray(archive.presentationInputs)?archive.presentationInputs:{};
 const list=(key:string):Record<string,unknown>[]=>Array.isArray(presentation[key])?(presentation[key] as Record<string,unknown>[]):[];
 return <section className="soft-card space-y-4 p-4" aria-label="Archived report">
  <h2 className="font-semibold">Archived revision {archive.revisionNumber} · {archive.disposition} · {archive.certification==='certified'?'Certified':'Incomplete — not certified'}</h2>
  <p>As of {new Date(archive.asOf).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} Asia/Kolkata · {archive.ruleVersion} · source {archive.sourceWatermark}.</p>
  {archive.superseded?<p role="status">Superseded by a later retained revision.</p>:null}
  {archive.dataQualityReasons.length?<p role="status">Unavailable evidence: {archive.dataQualityReasons.join(', ')}</p>:null}
  <p>Monthly award: {archive.certification==='certified'?archive.monthlySelection.winnerId??'No winner':'Unavailable — not certified'}.</p>
  <nav aria-label="Archived downloads" className="flex gap-3">{['json','text','csv'].map(format=><a className="underline" href={`${base}&format=${format}`} key={format}>Download {format.toUpperCase()}</a>)}</nav>
  {selected.map(({userId,result})=><section key={userId}><h3 className="font-medium">{userId} · {result.status} · score {result.compositeExact?displayPerformance(result.compositeExact,2):'Unavailable'}</h3><div className="overflow-auto"><table className="sheet-grid w-full"><thead><tr><th>Factor</th><th>Raw</th><th>Median</th><th>Delta</th><th>Contribution</th><th>Reasons</th></tr></thead><tbody>{FACTORS.map(f=>{const v=result.factors[f];return <tr key={f}><th>{f}</th><td>{displayPerformance(v.rawExact)}</td><td>{displayPerformance(v.medianExact)}</td><td>{displayPerformance(v.deltaExact)}</td><td>{displayPerformance(v.contributionExact)}</td><td>{v.reasons.join(', ')||'—'}</td></tr>;})}</tbody></table></div></section>)}
  <details><summary>Retained tasks, effort, attendance and support evidence</summary><p>{list('tasks').length} tasks · {list('logs').length} effort records · {list('attendance').length} attendance contexts · {list('contributions').length} contributions · {list('assets').length} assets.</p><div className="overflow-auto"><table className="sheet-grid w-full"><thead><tr><th>Task tag</th><th>Title</th><th>Status</th><th>Progress</th></tr></thead><tbody>{list('tasks').map((t,i)=><tr key={String(t.id??i)}><td>{String(t.task_tag??'Unavailable')}</td><td>{String(t.title??'Unavailable')}</td><td>{String(t.status??'Unavailable')}</td><td>{String(t.progress_percentage??'Unavailable')}</td></tr>)}</tbody></table></div><pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify({logs:list('logs'),attendance:list('attendance'),contributions:list('contributions'),checklists:list('checklists'),assets:list('assets'),relations:list('relations')},null,2)}</pre></details>
  {previous&&difference?<details><summary>Changes from revision {previous.revisionNumber}</summary><ul>{changes.map(c=><li key={c.userId}>{c.userId}: {c.oldStatus} → {c.newStatus}; score {c.oldScore?displayPerformance(c.oldScore,2):'Unavailable'} → {c.newScore?displayPerformance(c.newScore,2):'Unavailable'}; changed factors {c.changedFactors.join(', ')||'none'}</li>)}</ul><p>Certification: {difference.certification.before} → {difference.certification.after}. Availability: {difference.availability.before.join(', ')||'complete'} → {difference.availability.after.join(', ')||'complete'}.</p><p>Changed award dates: {difference.changedAwardDates.join(', ')||'none'}. Daily-win count changes: {difference.awardCounts.map(c=>`${c.userId} ${c.before} → ${c.after}`).join(', ')||'none'}.</p><p>Changed source records: {difference.sourceComparisonAvailable?difference.changedSources.join(', ')||'none':'Restricted to manager detail access'}.</p></details>:null}
  <Link className="underline" href={`/reports?period=${archive.period.slice(0,7)}`}>View live context</Link>
 </section>;
}
