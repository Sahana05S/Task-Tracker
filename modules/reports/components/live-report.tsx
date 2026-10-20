import { buttonVariants } from '@/shared/ui/button';
import { DownloadIcon, ListChecksIcon } from 'lucide-react';
import { OperationalEvidence } from './operational-evidence';
import { AwardHistory } from '@/modules/scoring/components/award-history';
import { CopyReport } from './copy-report';
import Link from 'next/link';
import { PerformanceBreakdown } from '@/modules/scoring/components/performance-breakdown';
import { ReportContext } from './view-context';
import { MissionNotice } from '@/shared/ui/mission-ui';
import { viewQuery } from '@/modules/reports/internal/presentation/context';
import { liveReport,reportText } from '@/modules/reports/internal/presentation/export';
import type { LivePresentation } from '@/modules/reports/internal/presentation/model';
import { cn } from '@/shared/utils';
export function LiveReport({model}:{model:LivePresentation}){
 const query=viewQuery(model.view)+(model.employeeId?'&employee='+encodeURIComponent(model.employeeId):'');
 return <section className="grid gap-5 lg:gap-6">
  <ReportContext model={model}/>
  <nav aria-label="Download live report" className="flex flex-wrap items-center gap-2">{['json','text','csv'].map(format=><a className={cn(buttonVariants({ variant: 'outline' }), 'h-9 gap-1.5 px-3')} key={format} href={'/api/reports/export?'+query+'&format='+format}><DownloadIcon className="size-4" aria-hidden="true"/>Download {format.toUpperCase()}</a>)}<CopyReport text={reportText(model)}/></nav>
  {model.awardAvailabilityReason?<MissionNotice tone="attention" role="status">{model.awardAvailabilityReason}</MissionNotice>:null}
  {model.awards?<AwardHistory awards={model.awards}/>:null}
  <MissionNotice>Detailed rows are restricted to your own work or manager access. Team members can see shared metric aggregates. Automatic Drive operations are unavailable; existing asset links remain usable.</MissionNotice>
  {model.calculation.members.filter(m=>!model.employeeId||m.userId===model.employeeId).map(m=><details key={m.userId} className="disclosure"><summary>{model.members.find(u=>u.id===m.userId)?.fullName??m.userId} · performance inputs</summary><PerformanceBreakdown result={m} context={model.calculation.context}/></details>)}
  <div className="soft-card p-5 sm:p-6">
   <h2 className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight"><ListChecksIcon className="text-primary size-5 shrink-0" aria-hidden="true"/>Tasks and effort</h2>
   <p className="text-muted-foreground mt-1 text-sm">Task productivity uses percentage points / task hours. Employee productivity uses period-earned scaled credit / regular attendance hours.</p>
   <div className="border-border mt-4 overflow-x-auto rounded-xl border"><table className="sheet-grid w-full min-w-[40rem]"><thead><tr><th>Task</th><th>Status</th><th>Current progress %</th><th>Task productivity</th><th>Deadline</th></tr></thead><tbody>{model.tasks.map(t=><tr key={t.id}><td><Link className="link" href={'/tasks/'+encodeURIComponent(t.taskTag)}><span className="task-tag text-primary">{t.taskTag}</span> · {t.title}</Link></td><td>{t.status}</td><td className="tabular-nums">{t.progressPercentage??'Unavailable'}</td><td className="tabular-nums">{model.taskRates.find(r=>r.taskId===t.id)?.value??'Unavailable'}</td><td>{t.dueDate??'Undated'}</td></tr>)}</tbody></table></div>
  </div>
  <p className="text-muted-foreground text-sm">Today: {model.today.date} · {model.today.logs.length} recorded logs. Yesterday: {model.yesterday.date} · {model.yesterday.logs.length} recorded logs. Only rows within the selected period are included.</p>
  <OperationalEvidence model={model}/>
  <details className="disclosure"><summary>Attendance validity, sections, contributions, links and source evidence</summary><pre className="bg-muted/70 max-h-[32rem] overflow-auto rounded-xl p-3 text-xs whitespace-pre-wrap break-words">{JSON.stringify({...liveReport(model),performance:undefined,tasks:undefined},null,2)}</pre></details>
 </section>;
}
