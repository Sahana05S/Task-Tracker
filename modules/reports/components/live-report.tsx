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
import { reportText } from '@/modules/reports/internal/presentation/export';
import { formatDate } from '@/shared/tracker/format';
import type { LivePresentation } from '@/modules/reports/internal/presentation/model';
import { cn } from '@/shared/utils';
/** `companyName` heads the copied text report (Settings > Company > Branding). */
export function LiveReport({model,companyName}:{model:LivePresentation;companyName?:string}){
 const query=viewQuery(model.view)+(model.employeeId?'&employee='+encodeURIComponent(model.employeeId):'');
 return <section className="grid gap-5 lg:gap-6">
  <ReportContext model={model}/>
  <nav aria-label="Download live report" className="flex flex-wrap items-center gap-2">{['json','text','csv'].map(format=><a className={cn(buttonVariants({ variant: 'outline' }), 'h-9 gap-1.5 px-3')} key={format} href={'/api/reports/export?'+query+'&format='+format}><DownloadIcon className="size-4" aria-hidden="true"/>Download {format.toUpperCase()}</a>)}<CopyReport text={reportText(model,companyName)}/></nav>
  {model.awardAvailabilityReason?<MissionNotice tone="attention" role="status">{model.awardAvailabilityReason}</MissionNotice>:null}
  {model.awards?<AwardHistory awards={model.awards}/>:null}
  <MissionNotice>You see your own detailed rows; managers see everyone&apos;s. Team totals are visible to all. Work files are linked by hand; Drive is not connected yet.</MissionNotice>
  {model.calculation.members.filter(m=>!model.employeeId||m.userId===model.employeeId).map(m=><details key={m.userId} className="disclosure"><summary>{model.members.find(u=>u.id===m.userId)?.fullName??'Team member'} · performance inputs</summary><PerformanceBreakdown result={m} context={model.calculation.context}/></details>)}
  <div className="soft-card p-5 sm:p-6">
   <h2 className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight"><ListChecksIcon className="text-primary size-5 shrink-0" aria-hidden="true"/>Tasks and effort</h2>
   <p className="text-muted-foreground mt-1 text-sm">Mission productivity is progress points per hour logged on the mission. A person&apos;s productivity is scaled progress per attendance hour.</p>
   <div className="border-border mt-4 overflow-x-auto rounded-xl border"><table className="sheet-grid w-full min-w-[40rem]"><thead><tr><th>Mission</th><th>Status</th><th>Progress</th><th>Progress per hour</th><th>Due</th></tr></thead><tbody>{model.tasks.map(t=><tr key={t.id}><td><Link className="link" href={'/tasks/'+encodeURIComponent(t.taskTag)}><span className="task-tag text-primary">{t.taskTag}</span> · {t.title}</Link></td><td>{t.status}</td><td className="tabular-nums">{t.progressPercentage==null?'—':`${t.progressPercentage}%`}</td><td className="tabular-nums">{model.taskRates.find(r=>r.taskId===t.id)?.value??'—'}</td><td className="tabular-nums">{t.dueDate?formatDate(t.dueDate):'No due date'}</td></tr>)}</tbody></table></div>
  </div>
  <p className="text-muted-foreground text-sm">{formatDate(model.today.date)}: {model.today.logs.length} time logs. {formatDate(model.yesterday.date)}: {model.yesterday.logs.length} time logs. Only days in the chosen month are included.</p>
  <OperationalEvidence model={model}/>
 </section>;
}
