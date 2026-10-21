import { kolkataDate } from '@/shared/time/kolkata';
import { nextDate, type DatedCalculation } from '@/modules/reports/client';
import { dailyStarHighlight, type DailyStarHighlight } from '@/modules/recognition/client';
import { roundToNumericScale, sumHours } from '@/modules/time-tracking/client';
import type { AwardHistory } from '@/modules/scoring/client';
import { Exact, exactMedian, type ExactValue } from '@/shared/math/exact';
import { FACTORS, type AwardDay, type DeadlineOutcomeBucket, type DateBucket, type Factor } from '@/modules/scoring/client';
import {
  CATEGORY_LABELS,
  TASK_CATEGORIES,
  TASK_FRESHNESS_STATES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@/shared/tracker/enums';
import type { AnalyticsPeriod } from '@/shared/time/period';
import type { MemberCalculation, MemberPerformance } from '@/modules/scoring/client';
import type {
  DailyStarRecord,
  DailyTaskLog,
  Task,
  TaskLink,
  TaskLinkType,
} from '@/types/tracker';

export interface EmployeeTrendPoint {
  date: string;
  label: string;
  value: number | null;
  display?:string;
  /** Team median for the same date; null when the median is unavailable. */
  median?: number | null;
  medianDisplay?: string;
}

export interface EmployeeDistributionBucket {
  key: string;
  label: string;
  value: number;
}

export interface EmployeeAnalyticsCharts {
  /** Composite score with the team median per dated observation; certified award history when there are none. */
  performanceScoreTrend: EmployeeTrendPoint[];
  productivityTrend: EmployeeTrendPoint[];
  progressTrend: EmployeeTrendPoint[];
  completionTrend: EmployeeTrendPoint[];
  loadingTrend: EmployeeTrendPoint[];
  criticalityTrend: EmployeeTrendPoint[];
  taskTypes: EmployeeDistributionBucket[];
  taskPriorities: EmployeeDistributionBucket[];
  taskStatuses: EmployeeDistributionBucket[];
  taskDocumentation: EmployeeDistributionBucket[];
  taskFreshness: EmployeeDistributionBucket[];
  /** Each factor's raw value with its team median, per dated observation, in engine order. */
  factorTrends: Record<Factor, EmployeeTrendPoint[]>;
  /** Task hours logged and regular attendance hours per day up to the as-of date. */
  dailyHours: EmployeeDayHours[];
  /** Daily star outcome per day up to the as-of date. */
  starDays: EmployeeStarDay[];
  /** Missions this member completed per day up to the as-of date (zero on other days). */
  missionsDone: DateBucket[];
  /** Met, missed and open overdue deadlines on this member's missions. */
  deadlines: DeadlineOutcomeBucket[];
}

export interface EmployeeDayHours {
  date: string;
  label: string;
  taskHours: number;
  /** Null when attendance is not recorded or not available for the day. */
  attendanceHours: number | null;
}

export type StarDayState = 'star' | 'other' | 'none' | 'waiting' | 'pending';

export interface EmployeeStarDay {
  date: string;
  state: StarDayState;
}

/** The attendance fields the hours chart reads from the live presentation. */
export interface EmployeeAttendanceDay {
  businessDate: string;
  available: boolean;
  attendanceHours: string | null;
}

export interface EmployeeAnalyticsChartInput {
  observations?:readonly DatedCalculation[];
  employeeId?:string;
  scoreHistory?:readonly AwardHistory[];
  period: AnalyticsPeriod;
  performance: MemberPerformance | null;
  tasks: readonly Task[];
  logs: readonly DailyTaskLog[];
  stars: readonly DailyStarRecord[];
  links: readonly TaskLink[];
  /** Asia/Kolkata as-of date; days after it are not charted. Defaults to today. */
  asOfDate?: string;
  attendanceDays?: readonly EmployeeAttendanceDay[];
  awardDays?: readonly AwardDay[];
  /** Mission outcomes from the shared dashboard read model, filtered to this member. */
  missionOutcomes?: { tasksDoneByDate: DateBucket[]; deadlineOutcomes: DeadlineOutcomeBucket[] };
}

const TASK_LINK_TYPES = [
  'Folder',
  'Document',
  'Account',
  'Flowchart',
  'Engineering',
  'Drawing',
  'Checklist',
  'Raw Link',
  'Other',
] as const satisfies readonly TaskLinkType[];

export function buildEmployeeAnalyticsCharts({
  period,
  performance,
  tasks,
  logs,
  stars,
  links,
  scoreHistory=[],
  observations=[],
  employeeId=performance?.userId,
  asOfDate=kolkataDate(),
  attendanceDays=[],
  awardDays=[],
  missionOutcomes,
}: EmployeeAnalyticsChartInput): EmployeeAnalyticsCharts {
  const dated=observations.filter(p=>p.date>=period.startDate&&p.date<=period.endDate&&p.date<=p.calculation.context.asOfLocalDate);
  const member=(p:DatedCalculation)=>p.calculation.members.find(m=>m.userId===employeeId);
  const scoreTrend=dated.map(p=>point(p.date,member(p)?.compositeExact??null,scoreMedian(p.calculation),2));
  const factorTrends=Object.fromEntries(FACTORS.map(factor=>[factor,dated.map(p=>point(p.date,member(p)?.factors[factor]?.rawExact??null,cohortMedian(p.calculation.members,factor),6))])) as Record<Factor,EmployeeTrendPoint[]>;
  const days=periodDays(period,asOfDate);
  const linksByTask = groupBy(links, (link) => link.taskId);
  const performanceScoreTrend=scoreHistory.filter(row=>['completed_winner','completed_none'].includes(row.status)&&row.certified&&row.calculation.compositeExact!==null).map(row=>({date:row.date,label:formatShortDate(row.date),value:Exact.from(row.calculation.compositeExact!).number()}));

  return {
    performanceScoreTrend:observations.length?scoreTrend:performanceScoreTrend.filter(p=>p.date>=period.startDate&&p.date<=period.endDate&&p.date<=asOfDate),
    productivityTrend:factorTrends.productivity,
    progressTrend:factorTrends.progress,
    completionTrend:factorTrends.completion,
    loadingTrend:factorTrends.loading,
    criticalityTrend:factorTrends.criticality,
    taskTypes: TASK_CATEGORIES.map((category) => ({
      key: category,
      label: CATEGORY_LABELS[category],
      value: countTasks(tasks, (task) => task.category === category),
    })),
    taskPriorities: TASK_PRIORITIES.map((priority) => ({
      key: priority,
      label: priority,
      value: countTasks(tasks, (task) => task.priority === priority),
    })),
    taskStatuses: TASK_STATUSES.map((status) => ({
      key: status,
      label: status,
      value: countTasks(tasks, (task) => task.status === status),
    })),
    taskDocumentation: [
      ...TASK_LINK_TYPES.map((linkType) => ({
        key: linkType,
        label: linkType,
        value: links.filter((link) => link.linkType === linkType).length,
      })),
      {
        key: 'Missing',
        label: 'No documentation',
        value: tasks.filter((task) => !linksByTask.has(task.id)).length,
      },
    ],
    taskFreshness: [...TASK_FRESHNESS_STATES.map((freshness) => ({
      key: freshness,
      label: freshness,
      value: countTasks(tasks, (task) => task.freshness === freshness),
    })),{key:'Unavailable',label:'Unavailable dates / policy',value:tasks.filter(t=>t.freshness===null).length}],
    factorTrends,
    dailyHours:dailyHours(days,logs.filter(log=>!employeeId||log.userId===employeeId),attendanceDays),
    starDays:days.map(date=>({date,state:starState(dailyStarHighlight({days:awardDays,policy:null,policyApproved:false},date,employeeId??''))})),
    missionsDone:days.map(date=>({date,label:formatShortDate(date),value:missionOutcomes?.tasksDoneByDate.find(bucket=>bucket.date===date)?.value??0})),
    deadlines:missionOutcomes?.deadlineOutcomes??[],
  };
}

/** Team median of composite scores; like the dashboard, unavailable unless every member's score is. */
function scoreMedian(calculation:{status:string;members:readonly MemberCalculation[]}){
  if(calculation.status!=='complete'||calculation.members.some(m=>m.compositeExact===null))return null;
  return exactMedian(calculation.members.map(m=>Exact.from(m.compositeExact!)))?.json()??null;
}

/** A factor's median is shared by its cohort, so any member's result carries it. */
function cohortMedian(members:readonly MemberCalculation[],factor:Factor){
  return members.map(m=>m.factors[factor]?.medianExact).find(Boolean)??null;
}

/** One dated point: the value and the median, exact for display, numbers for drawing. */
function point(date:string,value:ExactValue|null,median:ExactValue|null,places:number):EmployeeTrendPoint{
  return {date,label:formatShortDate(date),value:value?Exact.from(value).number():null,display:value?Exact.from(value).display(places):'Unavailable',
    median:median?Exact.from(median).number():null,medianDisplay:median?Exact.from(median).display(places):'Unavailable'};
}

function dailyHours(days:readonly string[],logs:readonly DailyTaskLog[],attendance:readonly EmployeeAttendanceDay[]):EmployeeDayHours[]{
  const logged=groupBy(logs,log=>log.logDate);
  const recorded=new Map(attendance.filter(day=>day.available&&day.attendanceHours!==null).map(day=>[day.businessDate,Number(day.attendanceHours)]));
  return days.map(date=>({date,label:formatShortDate(date),taskHours:roundToNumericScale(sumHours(logged.get(date)??[])),attendanceHours:recorded.get(date)??null}));
}

/** The recognition module's reading of a day, from this member's side. */
function starState(day:DailyStarHighlight):StarDayState{
  if(day.status==='winner')return day.isViewer?'star':'other';
  return day.status==='blocked'?'waiting':day.status;
}

/** ISO dates from the period start through the as-of date (or period end, whichever is first). */
function periodDays(period:AnalyticsPeriod,asOfDate:string):string[]{
  const last=asOfDate<period.endDate?asOfDate:period.endDate,out:string[]=[];
  for(let date=period.startDate;date<=last;date=nextDate(date))out.push(date);
  return out;
}

function countTasks(
  tasks: readonly Task[],
  predicate: (task: Task) => boolean,
): number {
  return tasks.reduce((count, task) => count + (predicate(task) ? 1 : 0), 0);
}

function groupBy<Item>(
  items: readonly Item[],
  getKey: (item: Item) => string,
): Map<string, Item[]> {
  const groups = new Map<string, Item[]>();

  for (const item of items) {
    const key = getKey(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  return groups;
}

function formatShortDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
