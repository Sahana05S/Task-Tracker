import { kolkataDate } from '@/shared/time/kolkata';
import type { DatedCalculation } from '@/modules/reports/client';
import type { CalculationContext, Provenance } from '@/modules/scoring/client';
import type { AwardHistory } from '@/modules/scoring/client';
import { Exact } from '@/shared/math/exact';
import {
  CATEGORY_LABELS,
  TASK_CATEGORIES,
  TASK_FRESHNESS_STATES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@/shared/tracker/enums';
import type { AnalyticsPeriod } from '@/shared/time/period';
import type { MemberPerformance } from '@/modules/scoring/client';
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
  context?:CalculationContext;
  reasons?:readonly string[];
  sources?:readonly Provenance[];
}

export interface EmployeeDistributionBucket {
  key: string;
  label: string;
  value: number;
}

export interface EmployeeAnalyticsCharts {
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
}: EmployeeAnalyticsChartInput): EmployeeAnalyticsCharts {
  const trend=(factor:string)=>observations.filter(p=>p.date>=period.startDate&&p.date<=period.endDate&&p.date<=p.calculation.context.asOfLocalDate).map(p=>{const m=p.calculation.members.find(m=>m.userId===employeeId),f=m?.factors[factor as keyof typeof m.factors],exact=factor==='score'?m?.compositeExact:f?.rawExact;return {date:p.date,label:formatShortDate(p.date),value:factor==='score'?m?.composite??null:f?.rawValue??null,display:exact?Exact.from(exact).display(factor==='score'?2:6):'Unavailable',context:p.calculation.context,reasons:factor==='score'?m?.reasons:f?.reasons,sources:f?.sources};});
  const linksByTask = groupBy(links, (link) => link.taskId);
  const performanceScoreTrend=scoreHistory.filter(row=>['completed_winner','completed_none'].includes(row.status)&&row.certified&&row.calculation.compositeExact!==null).map(row=>({date:row.date,label:formatShortDate(row.date),value:Exact.from(row.calculation.compositeExact!).number()}));

  return {
    performanceScoreTrend:observations.length?trend('score'):performanceScoreTrend.filter(p=>p.date>=period.startDate&&p.date<=period.endDate&&p.date<=kolkataDate()),
    productivityTrend:trend('productivity'),
    progressTrend:trend('progress'),
    completionTrend:trend('completion'),
    loadingTrend:trend('loading'),
    criticalityTrend:trend('criticality'),
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
  };
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
