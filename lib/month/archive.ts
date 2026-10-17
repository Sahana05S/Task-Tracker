import { createClient } from '@/shared/supabase/server';
import { loadPerformance } from '@/lib/performance/queries';
import { getAwards } from '@/lib/stars/read-model';
import { resolvePeriod } from '@/lib/analytics/engine';
import { nextDate } from '@/lib/presentation/context';
import { observationInstant } from '@/lib/presentation/clock';
import type { Json } from '@/types/database';
import type { CalculationResult,MemberCalculation } from '@/lib/performance/engine';
import type { MonthlySelection } from '@/lib/stars/contract';
import { FACTORS } from '@/lib/performance/engine';
import { displayPerformance } from '@/lib/performance/exact';
import { csvCell } from '@/lib/presentation/export';

export interface MonthHistory { state:'live'|'correction'|'closed';version:number;revisions:{number:number;disposition:'draft'|'closed';certification:'certified'|'incomplete_uncertified';recordedAt:string;asOf:string;reason:string|null}[] }
export interface MonthArchive {
 id:string;period:string;revisionNumber:number;disposition:'draft'|'closed';superseded:boolean;
 asOf:string;cutoffLocalDate:string;recordedAt:string;reason:string|null;ruleVersion:string;sourceWatermark:string;
 certification:'certified'|'incomplete_uncertified';dataQualityReasons:string[];
 members:{userId:string;result:MemberCalculation}[];calculationContext:CalculationResult['context'];
 sourceInputs:Json|null;presentationInputs:Json|null;awardEvidence:Json[];monthlySelection:MonthlySelection;
}
function firstDay(value:string):string {
 if(!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(value))throw new Error('Select a calendar month.');
 return value;
}
export async function monthHistory(period:string):Promise<MonthHistory>{
 const db=await createClient(),r=await db.rpc('month_archive_history',{p_period:firstDay(period)});
 if(r.error)throw new Error(r.error.message);
 return r.data as unknown as MonthHistory;
}
export async function monthRevision(period:string,revision:number|null=null,employee:string|null=null):Promise<MonthArchive|null>{
 const db=await createClient(),r=await db.rpc('month_archive_read',{p_period:firstDay(period),p_revision:revision,p_employee:employee});
 if(r.error)throw new Error(r.error.message);
 return r.data as unknown as MonthArchive|null;
}
export async function captureMonth(command:'draft'|'close'|'revise',period:string,expectedVersion:number,operation:string,reason:string){
 firstDay(period);
 const month=resolvePeriod(Number(period.slice(0,4)),Number(period.slice(5,7)));
 // The database clock is authoritative: never future to PostgreSQL, and it
 // includes every source committed before capture.
 const db=await createClient(),asOf=(await observationInstant(db)).instant.toISOString();
 const {sources,calculation}=await loadPerformance(db,period,nextDate(month.endDate),asOf);
 const awards=await getAwards(db,month,calculation);
 const r=await db.rpc('month_archive_command',{p_command:command,p_period:period,p_operation:operation,p_expected_version:expectedVersion,
  p_payload:{reason,sourceInputs:sources as unknown as Json,calculation:calculation as unknown as Json,monthlySelection:awards.monthly as unknown as Json}});
 if(r.error)throw new Error(r.error.message);
 return r.data;
}
export async function beginMonthCorrection(period:string,expectedVersion:number,operation:string,reason:string,scope:{kind:string;id:string;from:string;through:string}[]){
 const db=await createClient(),r=await db.rpc('month_archive_command',{p_command:'begin_correction',p_period:firstDay(period),p_operation:operation,p_expected_version:expectedVersion,p_payload:{reason,scope:{records:scope}}});
 if(r.error)throw new Error(r.error.message);
 return r.data;
}

/** Archived exports use only immutable rows returned by the scoped read RPC. */
export function archivedReport(archive:MonthArchive){
 return {label:`Archived revision ${archive.revisionNumber} · ${archive.certification==='certified'?'Certified':'Incomplete — not certified'}`,
  period:archive.period,asOf:archive.asOf,ruleVersion:archive.ruleVersion,sourceWatermark:archive.sourceWatermark,
  certification:archive.certification,dataQualityReasons:archive.dataQualityReasons,monthlySelection:archive.monthlySelection,
  members:archive.members,calculationContext:archive.calculationContext,awardEvidence:archive.awardEvidence,sourceInputs:archive.sourceInputs,presentationInputs:archive.presentationInputs};
}
export function archivedText(archive:MonthArchive):string {
 const report=archivedReport(archive);
 return [report.label,`Period: ${report.period}`,`As of: ${report.asOf} Asia/Kolkata`,`Rule: ${report.ruleVersion}`,`Source watermark: ${report.sourceWatermark}`,
  `Evidence: ${report.dataQualityReasons.join(', ')||'Complete'}`,`Monthly winner: ${report.certification==='certified'?report.monthlySelection.winnerId??'None':'Unavailable — not certified'}`,
  ...archive.members.flatMap(({userId,result})=>[`${userId}: ${result.status}; score ${result.compositeExact?displayPerformance(result.compositeExact,2):'Unavailable'}`,
   ...FACTORS.map(f=>{const v=result.factors[f];return `  ${f}: raw ${displayPerformance(v.rawExact)}; median ${displayPerformance(v.medianExact)}; delta ${displayPerformance(v.deltaExact)}; contribution ${displayPerformance(v.contributionExact)}; ${v.reasons.join(', ')}`;})])].join('\n');
}
export function archivedCsv(archive:MonthArchive):string {
 const lines=[['revision','period','certification','user_id','status','factor','unit','raw','median','delta','coefficient','contribution','cohort','population','reasons'].map(csvCell).join(',')];
 for(const {userId,result} of archive.members)for(const f of FACTORS){const v=result.factors[f];lines.push([archive.revisionNumber,archive.period,archive.certification,userId,result.status,f,v.unit,displayPerformance(v.rawExact),displayPerformance(v.medianExact),displayPerformance(v.deltaExact),v.coefficient,displayPerformance(v.contributionExact),v.cohortId??'',v.population.join('|'),v.reasons.join('|')].map(csvCell).join(','));}
 return lines.join('\n')+'\n';
}
export function compareRevisions(before:MonthArchive,after:MonthArchive){
 const previous=new Map(before.members.map(m=>[m.userId,m.result]));
 return after.members.map(({userId,result})=>{
  const old=previous.get(userId);
  const factors=Object.keys(result.factors) as (keyof MemberCalculation['factors'])[];
  return {userId,oldStatus:old?.status??'missing',newStatus:result.status,oldScore:old?.compositeExact??null,newScore:result.compositeExact,
   changedFactors:factors.filter(f=>JSON.stringify(old?.factors[f])!==JSON.stringify(result.factors[f]))};
 });
}
function sourceRows(value:Json|null):Map<string,string>{
 const source=(value??{}) as Record<string,Json>;
 const rows=new Map<string,string>();
 for(const kind of ['members','tasks','attendance'])for(const row of Array.isArray(source[kind])?source[kind] as Json[]:[]){
  if(row&&typeof row==='object'&&!Array.isArray(row)){
   const id=String((row as Record<string,Json>).id??(row as Record<string,Json>).userId??'');
   if(id)rows.set(`${kind}:${id}`,JSON.stringify(row));
  }
 }
 const contributions=source.contributions as Record<string,Json>|undefined;
 for(const row of Array.isArray(contributions?.sources)?contributions.sources:[]){
  if(row&&typeof row==='object'&&!Array.isArray(row)){
   const item=row as Record<string,Json>,id=String(item.id??'');
   if(id)rows.set(`contribution:${String(item.kind??'unknown')}:${id}`,JSON.stringify(row));
  }
 }
 return rows;
}
export function archiveDifferences(before:MonthArchive,after:MonthArchive){
 const old=sourceRows(before.sourceInputs),current=sourceRows(after.sourceInputs),keys=new Set([...old.keys(),...current.keys()]);
 const changedSources=[...keys].filter(k=>old.get(k)!==current.get(k)).sort();
 const oldAwards=new Map(before.awardEvidence.map(a=>[String((a as Record<string,Json>).date),JSON.stringify(a)]));
 const newAwards=new Map(after.awardEvidence.map(a=>[String((a as Record<string,Json>).date),JSON.stringify(a)]));
 const changedAwardDates=[...new Set([...oldAwards.keys(),...newAwards.keys()])].filter(k=>oldAwards.get(k)!==newAwards.get(k)).sort();
 const counts=new Set([...Object.keys(before.monthlySelection.counts),...Object.keys(after.monthlySelection.counts)]);
 return {members:compareRevisions(before,after),changedSources:before.sourceInputs&&after.sourceInputs?changedSources:[],sourceComparisonAvailable:Boolean(before.sourceInputs&&after.sourceInputs),changedAwardDates,
  awardCounts:[...counts].sort().map(userId=>({userId,before:before.monthlySelection.counts[userId]??0,after:after.monthlySelection.counts[userId]??0})).filter(c=>c.before!==c.after),
  certification:{before:before.certification,after:after.certification},availability:{before:before.dataQualityReasons,after:after.dataQualityReasons}};
}
