import { computeTeamAnalytics, type TeamAnalytics } from '@/modules/scoring/client';
import { summarizeAttendance,EMPTY_ATTENDANCE_SUMMARY } from '@/modules/attendance/client';
import { parsePerformanceSources, resolvePerformance, taskProductivity, type PerformanceSources } from '@/modules/scoring/client';
import { Exact } from '@/shared/math/exact';
import { classifyFreshness, eligibilityReasons } from '@/modules/tasks/client';
import { mapTask } from '@/modules/tasks/client';
import { mapDailyTaskLog } from '@/modules/time-tracking/client';
import type { Database } from '@/types/database';
import type { Task,User,DailyTaskLog } from '@/types/tracker';
import type { AttendanceInputContext } from '@/modules/support/client';
import type { CalculationResult } from '@/modules/scoring/client';
import { nextDate,previousDate,type ViewContext } from './context';
import type { AwardReadModel } from '@/modules/scoring/client';
type Row=Record<string,unknown>;
export interface PresentationResponse {
 contract:'m11-live-presentation-v1';sources:PerformanceSources;presentationAvailable:boolean;presentationAvailableFrom:string;presentationWatermark:string;
 scope:'employee_detail'|'manager_team_detail'|'team_summary_with_own_details';detailUserId:string|null;
 tasks:Row[];checklists:Row[];assets:Row[];relations:Row[];logs:Row[];contributions:{kind:string;source:Row}[];
 attendance:AttendanceInputContext[];series:{date:string;sources:PerformanceSources}[];
}
export interface DatedCalculation {date:string;calculation:CalculationResult}
export interface LivePresentation {
 awards?:AwardReadModel;awardAvailabilityReason?:string;
 view:ViewContext;calculation:CalculationResult;sources:PerformanceSources;analytics:TeamAnalytics;
 scope:PresentationResponse['scope'];employeeId:string|null;detailsAvailable:boolean;detailsAvailableFrom:string;presentationWatermark:string;
 members:User[];tasks:Task[];logs:DailyTaskLog[];checklists:Row[];assets:Row[];relations:Row[];contributions:PresentationResponse['contributions'];attendance:AttendanceInputContext[];
 series:DatedCalculation[];taskRates:{taskId:string;value:string;reasons:string[]}[];
 today: {date:string;logs:DailyTaskLog[]};yesterday:{date:string;logs:DailyTaskLog[]};
}
export function buildPresentation(value:unknown,view:ViewContext,employeeId:string|null=null):LivePresentation {
 const r=value as PresentationResponse;
 if(!r||r.contract!=='m11-live-presentation-v1'||typeof r.presentationAvailable!=='boolean'||!['tasks','logs','assets','relations','checklists','attendance','contributions','series'].every(k=>Array.isArray(r[k as keyof PresentationResponse])))throw new Error('Live presentation response is unavailable.');
 const sources=parsePerformanceSources(r.sources);
 if(sources.asOf!==view.asOf&&new Date(sources.asOf).getTime()!==new Date(view.asOf).getTime()||sources.periodStart!==view.period.startDate||sources.periodEndExclusive!==nextDate(view.period.endDate))throw new Error('Presentation context mismatch.');
 const calculation=resolvePerformance(sources);
 const members:User[]=sources.members.map(m=>({id:m.id,fullName:m.fullName,employeeId:m.employeeId,email:'',role:m.role,isActive:m.active,createdAt:'',updatedAt:''}));
 const full=new Map(r.tasks.map(t=>[String(t.id),t]));
 const allTasks=sources.tasks.map(t=>{
  const row=full.get(t.id),fresh=classifyFreshness({assignedDate:t.assignedDate,dueDate:t.dueDate,completedDate:t.completedDate,status:t.status},view.asOfLocalDate);
  const base=row?mapTask(row as unknown as Database['public']['Tables']['tasks']['Row']):{id:t.id,taskTag:t.tag,title:'Task '+t.tag,description:null,comments:null,createdAt:'',updatedAt:'',reviewerId:null,reviewerIds:[],scaleMode:'manual',scaleInputs:{},scaleVersion:Number(t.scaleVersion),participantVersion:Number(t.shareVersion)} as unknown as Task;
  const scale=t.scale===null?null:Number(t.scale),progress=t.progress===null?null:Number(t.progress);
  return {...base,taskTag:t.tag,category:t.category,priority:t.priority,status:t.status,assigneeId:t.primaryAssignee,assigneeIds:t.participants,taskScale:scale,progressPercentage:progress,
   participantCreditMode:t.creditMode as Task['participantCreditMode'],participantShares:t.shares as Record<string,number>|null,assignedDate:t.assignedDate,dueDate:t.dueDate,completedDate:t.completedDate,
   freshness:fresh.state,freshnessReason:fresh.reason,archivedEffectiveDate:t.archivedEffectiveDate??null,handoffSuccessorId:t.handoffSuccessorId??null,
   validForMetrics:eligibilityReasons({taskScale:scale,progressPercentage:progress,status:t.status,priority:t.priority}).length===0,
   earnedProgressCredits:Object.fromEntries(Object.entries(t.periodCredits??{}).map(([id,credit])=>[id,Number(credit)]))} as Task;
 });
 const logs=r.logs.map(row=>mapDailyTaskLog(row as unknown as Database['public']['Tables']['daily_task_logs']['Row']));
 const detailSummaries=new Map(r.attendance.map(a=>[a.userId,summarizeAttendance(a.days.filter(d=>d.available&&d.status!==null&&d.attendanceHours!==null&&d.offHours!==null).map(d=>({status:d.status!,attendanceHours:Number(d.attendanceHours),offHours:Number(d.offHours)})))]));
 const summaries=new Map(sources.attendance.map(a=>[a.userId,{...EMPTY_ATTENDANCE_SUMMARY,...detailSummaries.get(a.userId),attendanceHours:a.hours===null?0:Number(a.hours),offHours:a.offHours===null?0:Number(a.offHours)}]));
 const analytics=computeTeamAnalytics({calculation,members,tasks:allTasks,logs,attendanceSummaries:summaries,period:view.period});
 const loggedIds=new Set(logs.map(l=>l.taskId));
 const tasks=employeeId?allTasks.filter(t=>t.assigneeIds.includes(employeeId)||loggedIds.has(t.id)||Object.hasOwn(t.earnedProgressCredits??{},employeeId)):allTasks;
 const series=r.series.filter(p=>p.date>=view.period.startDate&&p.date<=view.period.endDate&&p.date<=view.asOfLocalDate).map(p=>({date:p.date,calculation:resolvePerformance(parsePerformanceSources(p.sources))}));
 const taskRates=tasks.map(t=>{const source=sources.tasks.find(s=>s.id===t.id)!,rate=taskProductivity(source.progress,source.taskHours);return {taskId:t.id,value:rate.available&&rate.value!==null?Exact.from(rate.value).display(6):'Unavailable',reasons:rate.reasons};});
 return {view,calculation,sources,analytics,scope:r.scope,employeeId,detailsAvailable:r.presentationAvailable,detailsAvailableFrom:r.presentationAvailableFrom,presentationWatermark:r.presentationWatermark,
  members,tasks,logs,checklists:r.checklists,assets:r.assets,relations:r.relations,contributions:r.contributions,attendance:r.attendance,series,taskRates,
  today:{date:view.asOfLocalDate,logs:logs.filter(l=>l.logDate===view.asOfLocalDate)},yesterday:{date:previousDate(view.asOfLocalDate),logs:logs.filter(l=>l.logDate===previousDate(view.asOfLocalDate))}};
}
