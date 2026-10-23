import { Exact } from '@/shared/math/exact';
import { performanceReport } from '@/modules/scoring/client';
import type { LivePresentation } from './model';
import { formatHours } from '@/shared/tracker/format';
import { csvCell } from '@/shared/tracker/csv';
export { csvCell };
export function liveReport(model:LivePresentation){return {label:'Live report; not a frozen month',context:model.view,scope:model.scope,detailsAvailable:model.detailsAvailable,detailsAvailableFrom:model.detailsAvailableFrom,presentationWatermark:model.presentationWatermark,awardAvailability:model.awardAvailabilityReason??'Retained M08 observations',awards:model.awards,performance:performanceReport(model.calculation,model.employeeId),tasks:model.tasks,taskProductivity:model.taskRates,logs:model.logs,today:model.today,yesterday:model.yesterday,attendance:model.attendance,sections:model.checklists,contributions:model.contributions,assets:model.assets,relations:model.relations};}
export function reportCsv(model:LivePresentation):string {
 const rows:unknown[][]=[['Live report',model.view.period.label,model.view.asOf,'Asia/Kolkata',model.calculation.context.ruleVersion],['Employee','Factor','Unit','Raw','Median','Delta','Coefficient','Contribution','Availability','Reasons']];
 for(const m of model.calculation.members.filter(m=>!model.employeeId||m.userId===model.employeeId))for(const [factor,r]of Object.entries(m.factors))rows.push([m.userId,factor,r.unit,r.rawExact===null?'Unavailable':Exact.from(r.rawExact).display(6),r.medianExact===null?'Unavailable':Exact.from(r.medianExact).display(6),r.deltaExact===null?'Unavailable':Exact.from(r.deltaExact).display(6),r.coefficient,r.contributionExact===null?'Unavailable':Exact.from(r.contributionExact).display(6),r.available?'Available':'Unavailable',r.reasons.join('; ')]);
 for(const m of model.calculation.members.filter(m=>!model.employeeId||m.userId===model.employeeId))rows.push([m.userId,'Final composite','score',m.compositeExact===null?'Unavailable':Exact.from(m.compositeExact).display(2),'','','','',m.eligibleForRanking?'Eligible':'Ineligible / unavailable',m.reasons.join('; ')]);
 return rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}
/** Plain-text live report; the header names the company when its name is known (Settings > Company > Branding). */
export function reportText(model:LivePresentation,companyName?:string):string {
 const exact=(value:Parameters<typeof Exact.from>[0]|null,places=6)=>value===null?'Unavailable':Exact.from(value).display(places);
 const lines=[`${companyName?`${companyName} · `:''}Stellar live report — ${model.view.period.label}`,`As of ${model.view.asOf} (Asia/Kolkata date ${model.view.asOfLocalDate})`,`Rule: ${model.calculation.context.ruleVersion}`,`Scope: ${model.scope}`,`Details: ${model.detailsAvailable?'Recorded':'Unavailable before '+model.detailsAvailableFrom}`,`Awards: ${model.awardAvailabilityReason??model.awards?.monthly.status??'Unavailable'}`];
 for(const m of model.calculation.members.filter(m=>!model.employeeId||m.userId===model.employeeId)){
  lines.push('',model.members.find(u=>u.id===m.userId)?.fullName??m.userId,`Final score: ${exact(m.compositeExact,2)}; ranking: ${m.eligibleForRanking?'eligible':'ineligible / unavailable'}`);
  if(m.compositeExact===null)lines.push(`Available-factor subtotal (partial): ${exact(m.knownSubtotalExact,2)}`);
  for(const [name,f]of Object.entries(m.factors))lines.push(`${name} [${f.unit}]: raw ${exact(f.rawExact)}, median ${exact(f.medianExact)}, delta ${exact(f.deltaExact)}, coefficient ${f.coefficient}, contribution ${exact(f.contributionExact)}. ${f.reasons.join('; ')}`);
 }
 lines.push('','Tasks (current progress is separate from period-earned credit):');
 for(const t of model.tasks)lines.push(`${t.taskTag}: ${t.title}; ${t.status}; progress ${t.progressPercentage??'Unavailable'}%; deadline ${t.dueDate??'Undated'}; task productivity ${model.taskRates.find(r=>r.taskId===t.id)?.value??'Unavailable'} percentage points/task-hour`);
 lines.push('','Effort:');for(const l of model.logs)lines.push(`${l.logDate}: ${model.tasks.find(t=>t.id===l.taskId)?.taskTag??l.taskId}, ${formatHours(l.hoursWorked)} h. ${l.updateNotes??''} ${(l.rawLinks??[]).join(' ')}`);
 lines.push('','Attendance:');for(const a of model.attendance)for(const d of a.days)lines.push(`${a.userId} ${d.businessDate}: ${d.status??'Unavailable'}, regular ${d.attendanceHours==null?'Unavailable':formatHours(d.attendanceHours)} h, off-hours ${d.offHours==null?'Unavailable':formatHours(d.offHours)} h, validity ${d.valid===null?'Unavailable':d.valid?'valid':'invalid'}. ${d.reasons.join('; ')}`);
 lines.push('','Section summaries:',JSON.stringify(model.checklists,null,2),'Contribution records:',JSON.stringify(model.contributions,null,2),'Existing asset links:',JSON.stringify(model.assets,null,2));
 return lines.join('\n');
}
