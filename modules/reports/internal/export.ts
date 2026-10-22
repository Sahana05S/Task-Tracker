import { NextResponse } from 'next/server';
import type { UserRole } from '@/types/tracker';
import { getCurrentProfile } from '@/shared/session/profile';
import { liveViewContext } from '@/modules/reports/internal/presentation/clock';
import { getLivePresentation } from '@/modules/reports/internal/presentation/queries';
import { liveReport,reportCsv,reportText } from '@/modules/reports/internal/presentation/export';
import { archivedReport,archivedText,archivedCsv,monthRevision } from '@/modules/reports/internal/month/archive';
import { dailyPerfCsv,dailyPerfFilter,monthToDate,seesTeamDetail } from '@/modules/reports/internal/daily-perf-log';
import { getDailyPerfLog } from '@/modules/reports/internal/team-analytics';
import { kolkataDate } from '@/shared/time/kolkata';
import { currentPeriod } from '@/shared/time/period';
/**
 * The report export endpoint: the live report, or a retained month revision,
 * as JSON, CSV or text. Employees may export only their own detail. PRIVATE
 * (the route handler calls it through the module's index).
 */
export async function handleReportExport(request:Request){
 const profile=await getCurrentProfile();if(!profile?.isActive)return NextResponse.json({error:'Active authentication required.'},{status:403});
 const p=new URL(request.url).searchParams,employee=p.get('employee');
 if(p.get('report')==='daily-log')return dailyLogExport(p,profile);
 if(employee&&employee!==profile.id&&!seesTeamDetail(profile.role))return NextResponse.json({error:'Employee detail access denied.'},{status:403});
 let context;try{context=await liveViewContext(p.get('period')??undefined,p.get('asOf')??undefined);}catch{return NextResponse.json({error:'Invalid report context.'},{status:400});}
 const format=p.get('format')??'json';if(!['json','csv','text'].includes(format))return NextResponse.json({error:'Unsupported export format.'},{status:400});
 const revisionText=p.get('revision'),revision=revisionText===null?null:Number(revisionText);
 if(revision!==null&&(!Number.isSafeInteger(revision)||revision<1))return NextResponse.json({error:'Invalid revision.'},{status:400});
 try{
  const archived=revision===null?null:await monthRevision(context.period.startDate,revision,employee);
  if(revision!==null&&!archived)return NextResponse.json({error:'Archived revision not found.'},{status:404});
  const model=archived?null:await getLivePresentation(context,employee);
  const body=archived?(format==='csv'?archivedCsv(archived):format==='text'?archivedText(archived):JSON.stringify(archivedReport(archived),null,2)):
   format==='csv'?reportCsv(model!):format==='text'?reportText(model!):JSON.stringify(liveReport(model!),null,2);
  return new Response(body,{headers:{'Content-Type':format==='csv'?'text/csv; charset=utf-8':format==='text'?'text/plain; charset=utf-8':'application/json','Content-Disposition':`attachment; filename="taskpulse-${context.period.startDate}${revision!==null?'-revision-'+revision:'-live'}.${format==='text'?'txt':format}"`,'Cache-Control':'private, no-store'}});
 }catch{return NextResponse.json({error:'Report evidence unavailable. Retry after the source or schema issue is resolved.'},{status:503});}
}

/** `report=daily-log`: the daily perf log as CSV for `member`, `from`, `to` (default month to date). Members get only their own rows. */
async function dailyLogExport(p:URLSearchParams,profile:{id:string;role:UserRole}){
 const member=p.get('member');
 if(member&&member!==profile.id&&!seesTeamDetail(profile.role))return NextResponse.json({error:'Employee detail access denied.'},{status:403});
 const filter=dailyPerfFilter({member,from:p.get('from'),to:p.get('to')},monthToDate(currentPeriod(),kolkataDate()),profile);
 try{
  const body=dailyPerfCsv((await getDailyPerfLog(filter)).rows);
  return new Response(body,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="taskpulse-daily-log-${filter.from}-to-${filter.to}.csv"`,'Cache-Control':'private, no-store'}});
 }catch(error){console.error('Daily perf log export failed',error);return NextResponse.json({error:'Daily perf log unavailable. Retry after the source or schema issue is resolved.'},{status:503});}
}
