import { getLivePresentation } from '@/modules/reports';
import { viewContext, type ViewContext } from '@/modules/reports/client';
import type { LivePresentation } from '@/modules/reports/client';
import { optionalEmployeePerformance } from '@/lib/team/performance-availability';
import { getAwards, type AwardReadModel } from '@/modules/scoring';
import { getTaskWorkspaceData } from '@/modules/tasks';
import { getTeamSummaryInputs } from '@/modules/scoring';
import { getCurrentProfile } from '@/shared/session/profile';
import { canViewEmployeeReports } from '@/lib/team/permissions';
import { currentPeriod, type AnalyticsPeriod } from '@/shared/time/period';
import { type MemberPerformance } from '@/modules/scoring/client';
import { getTeamAnalytics } from '@/modules/reports';
import {
  ATTENDANCE_COLUMNS,
  mapAttendanceRecords,
} from '@/modules/attendance/client';
import { summarizeAttendance, type AttendanceSummary } from '@/modules/attendance/client';
import { LOG_COLUMNS, mapDailyTaskLogs } from '@/modules/time-tracking/client';
import { sumHours } from '@/modules/time-tracking/client';
import { mapUser, USER_COLUMNS } from '@/shared/supabase/mappers';
import { createClient } from '@/shared/supabase/server';
import {
  getSupportModuleData,
  summarizeEmployeeSupport,
  type EmployeeSupportSummary,
  type SupportSummary,
} from '@/modules/support';
import {
  buildEmployeeAnalyticsCharts,
  type EmployeeAnalyticsCharts,
} from '@/lib/team/employee-charts';
import { mapTasks, TASK_COLUMNS, withTaskParticipants } from '@/modules/tasks/client';
import {
  DAILY_STAR_COLUMNS,
  mapDailyStarRecords,
  mapPerformanceScoreComponents,
  mapReportSnapshots,
  PERFORMANCE_COMPONENT_COLUMNS,
  REPORT_SNAPSHOT_COLUMNS,
} from '@/lib/team/mappers';
import type {
  AttendanceRecord,
  DailyStarRecord,
  DailyTaskLog,
  PerformanceScoreComponent,
  ReportSnapshot,
  Task,
  TaskLink,
  User,
} from '@/types/tracker';
import type { TaskLinkRow } from '@/types/database';

export interface TeamIndexMember {
  readonly user: User;
  readonly performance: MemberPerformance | null;
  readonly performanceUnavailableReason?: string;
  readonly dailyStarCount: number;
  readonly currentPerformanceScore: number | null;
  readonly reportCount: number;
}

export interface TeamIndexData {
  readonly presentation:LivePresentation;
  readonly awards:AwardReadModel;
  readonly period: AnalyticsPeriod;
  readonly members: readonly TeamIndexMember[];
  readonly supportSummary: SupportSummary;
}

export interface EmployeeProfileData {
  readonly presentation:LivePresentation;
  readonly awards:AwardReadModel;
  readonly period: AnalyticsPeriod;
  readonly employee: User;
  readonly performance: MemberPerformance | null;
  readonly performanceUnavailableReason?: string;
  readonly tasks: readonly Task[];
  readonly taskLinks: readonly TaskLink[];
  readonly logs: readonly DailyTaskLog[];
  readonly todayLogs: readonly DailyTaskLog[];
  readonly yesterdayLogs: readonly DailyTaskLog[];
  readonly todayTasks: readonly Task[];
  readonly yesterdayTasks: readonly Task[];
  readonly stars: readonly DailyStarRecord[];
  readonly attendance: readonly AttendanceRecord[];
  readonly attendanceSummary: AttendanceSummary;
  readonly taskHourSummary: {
    readonly totalHours: number;
    readonly todayHours: number;
    readonly yesterdayHours: number;
  };
  readonly reports: readonly ReportSnapshot[];
  readonly charts: EmployeeAnalyticsCharts;
  readonly supportSummary: EmployeeSupportSummary;
}

export interface EmployeeReportsData {
  readonly presentation:LivePresentation;
  readonly awards:AwardReadModel;
  readonly period: AnalyticsPeriod;
  readonly employee: User;
  readonly performance: MemberPerformance | null;
  readonly performanceUnavailableReason?: string;
  readonly reports: readonly ReportSnapshot[];
  readonly scoreComponents: readonly PerformanceScoreComponent[];
  readonly stars: readonly DailyStarRecord[];
  readonly attendanceSummary: AttendanceSummary;
}

export async function getTeamIndexData(
  period: AnalyticsPeriod = currentPeriod(),
  context:ViewContext=viewContext(period.startDate.slice(0,7)),
): Promise<TeamIndexData> {
  const supabase = await createClient();
  const presentation=await getLivePresentation(context);
  const [analytics, supportData, summaryInputs] = await Promise.all([
    Promise.resolve(presentation.analytics),
    getSupportModuleData(period,context.asOf),
    getTeamSummaryInputs(period),
  ]);
  const userIds = analytics.members.map((member) => member.userId);

  const starRows = userIds.length === 0 ? [] : await selectOrEmpty(
    supabase.from('daily_star_records').select(DAILY_STAR_COLUMNS).in('user_id', userIds)
      .gte('star_date', period.startDate).lte('star_date', period.endDate),
  );
  const stars = mapDailyStarRecords(starRows);
  const awards=presentation.awards!;

  return {
    presentation,
    awards,
    period,
    members: analytics.members.map((performance) => ({
      user: performanceToUser(performance),
      performance,
      dailyStarCount: awards.days.filter(day=>day.certified&&day.status==='completed_winner'&&day.winnerId===performance.userId)
        .length,
      currentPerformanceScore: performance.starScore,
      performanceUnavailableReason:performance.performanceUnavailableReason,
      reportCount: summaryInputs.reportCounts.get(performance.userId) ?? 0,
    })),
    supportSummary: supportData.summary,
  };
}

export async function getEmployeeProfileData(
  employeeId: string,
  period: AnalyticsPeriod = currentPeriod(),
  now: Date = new Date(),
): Promise<EmployeeProfileData | null> {
  const supabase = await createClient();
  const employee = await getEmployeeByEmployeeId(employeeId);
  const viewer = await getCurrentProfile();
  if (!employee || !viewer || !canViewEmployeeReports(viewer, employee)) return null;

  const presentation=await getLivePresentation(viewContext(period.startDate.slice(0,7),now.toISOString(),now,0),employee.id); // now: page's validated as-of
  const performance=presentation.analytics.members.find(m=>m.userId===employee.id)??null;
  const performanceUnavailableReason=performance?.calculation?.status==='incomplete'?'Required performance inputs are unavailable.':undefined;
  const [currentTasks, logs, stars, attendance, reports] = await Promise.all([
    getAssignedTasks(employee.id),
    selectOrEmpty(
      supabase
        .from('daily_task_logs')
        .select(LOG_COLUMNS).is('reversed_at', null)
        .eq('user_id', employee.id)
        .gte('log_date', period.startDate)
        .lte('log_date', period.endDate)
        .order('log_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ),
    selectOrEmpty(
      supabase
        .from('daily_star_records')
        .select(DAILY_STAR_COLUMNS)
        .eq('user_id', employee.id)
        .gte('star_date', period.startDate)
        .lte('star_date', period.endDate)
        .order('star_date', { ascending: false }),
    ),
    selectOrEmpty(
      supabase
        .from('attendance_records')
        .select(ATTENDANCE_COLUMNS)
        .eq('user_id', employee.id)
        .gte('attendance_date', period.startDate)
        .lte('attendance_date', period.endDate)
        .order('attendance_date', { ascending: false }),
    ),
    selectOrEmpty(
      supabase
        .from('report_snapshots')
        .select(REPORT_SNAPSHOT_COLUMNS)
        .eq('employee_id', employee.id)
        .order('created_at', { ascending: false }),
    ),
  ]);

  const tasks=presentation.tasks;
  const mappedLogs = presentation.logs;
  const mappedAttendance = mapAttendanceRecords(attendance);
  const taskLinks = presentation.assets.map(row=>mapTaskLink(row as unknown as TaskLinkRow));
  const supportData = await getSupportModuleData(period,presentation.view.asOf);
  const today = presentation.view.asOfLocalDate;
  const yesterday = previousIsoDate(today);
  const todayLogs = mappedLogs.filter((log) => log.logDate === today);
  const yesterdayLogs = mappedLogs.filter((log) => log.logDate === yesterday);
  const mappedStars = mapDailyStarRecords(stars);
  const awards=presentation.awards!;

  return {
    presentation,
    awards,
    period,
    employee,
    performance,
    performanceUnavailableReason,
    tasks,
    taskLinks,
    logs: mappedLogs,
    todayLogs,
    yesterdayLogs,
    todayTasks: tasksForDateEvidence(tasks, todayLogs, today),
    yesterdayTasks: tasksForDateEvidence(tasks, yesterdayLogs, yesterday),
    stars: mappedStars,
    attendance: mappedAttendance,
    attendanceSummary: presentation.analytics.members.find(m=>m.userId===employee.id)?.attendance??summarizeAttendance([]),
    taskHourSummary: {
      totalHours: sumHours(mappedLogs),
      todayHours: sumHours(todayLogs),
      yesterdayHours: sumHours(yesterdayLogs),
    },
    reports: mapReportSnapshots(reports),
    charts: buildEmployeeAnalyticsCharts({
      period,
      performance,
      tasks,
      logs: mappedLogs,
      stars: mappedStars,
      scoreHistory:awards.history,
      observations:presentation.series,employeeId:employee.id,
      links: taskLinks,
    }),
    supportSummary: summarizeEmployeeSupport({
      userId: employee.id,
      facts: supportData.facts,
      ideas: supportData.ideas,
      suggestions: supportData.suggestions,
      salesLogs: supportData.salesLogs,
      reports: supportData.reports,
    }),
  };
}

export async function getEmployeeReportsData(
  employeeId: string,
  period: AnalyticsPeriod = currentPeriod(),
  now:Date=new Date(),
): Promise<EmployeeReportsData | null> {
  const supabase = await createClient();
  const employee = await getEmployeeByEmployeeId(employeeId);
  const viewer = await getCurrentProfile();
  if (!employee || !viewer || !canViewEmployeeReports(viewer, employee)) return null;

  const presentation=await getLivePresentation(viewContext(period.startDate.slice(0,7),now.toISOString(),now,0),employee.id); // now: page's validated as-of
  const performance=presentation.analytics.members.find(m=>m.userId===employee.id)??null;
  const performanceUnavailableReason=performance?.calculation?.status==='incomplete'?'Required performance inputs are unavailable.':undefined;
  const [reports, components, stars, attendance] = await Promise.all([
    selectOrEmpty(
      supabase
        .from('report_snapshots')
        .select(REPORT_SNAPSHOT_COLUMNS)
        .eq('employee_id', employee.id)
        .order('created_at', { ascending: false }),
    ),
    selectOrEmpty(
      supabase
        .from('performance_score_components')
        .select(PERFORMANCE_COMPONENT_COLUMNS)
        .eq('user_id', employee.id)
        .gte('score_date', period.startDate)
        .lte('score_date', period.endDate)
        .order('score_date', { ascending: false }),
    ),
    selectOrEmpty(
      supabase
        .from('daily_star_records')
        .select(DAILY_STAR_COLUMNS)
        .eq('user_id', employee.id)
        .gte('star_date', period.startDate)
        .lte('star_date', period.endDate)
        .order('star_date', { ascending: false }),
    ),
    selectOrEmpty(
      supabase
        .from('attendance_records')
        .select(ATTENDANCE_COLUMNS)
        .eq('user_id', employee.id)
        .gte('attendance_date', period.startDate)
        .lte('attendance_date', period.endDate),
    ),
  ]);

  const awards=presentation.awards!;
  return {
    presentation,
    awards,
    period,
    employee,
    performance,
    performanceUnavailableReason,
    reports: mapReportSnapshots(reports),
    scoreComponents: mapPerformanceScoreComponents(components),
    stars: mapDailyStarRecords(stars),
    attendanceSummary: presentation.analytics.members.find(m=>m.userId===employee.id)?.attendance??summarizeAttendance([]),
  };
}

export async function getEmployeeByEmployeeId(
  employeeId: string,
): Promise<User | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('users')
    .select(USER_COLUMNS)
    .eq('employee_id', employeeId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load employee: ${error.message}`);
  return data ? mapUser(data) : null;
}

async function getAssignedTasks(userId: string): Promise<Task[]> {
  const {tasks} = await getTaskWorkspaceData();
  return tasks.filter((task) => task.assigneeIds.includes(userId)).sort((a,b) => a.taskTag.localeCompare(b.taskTag));
}

async function getTaskLinks(taskIds: readonly string[]): Promise<TaskLink[]> {
  if (taskIds.length === 0) return [];

  const supabase = await createClient();
  const rows = await selectOrEmpty(
    supabase
      .from('task_links')
      .select('*')
      .in('task_id', [...taskIds])
      .order('link_type')
      .order('label'),
  );

  return rows.map(mapTaskLink);
}

function mapTaskLink(row: TaskLinkRow): TaskLink {
  return {
    id: row.id,
    taskId: row.task_id,
    linkType: row.link_type,
    label: row.label,
    url: row.url,
    storagePath: row.storage_path,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function tasksForDateEvidence(
  tasks: readonly Task[],
  logs: readonly DailyTaskLog[],
  date: string,
): Task[] {
  const taskIds = new Set(logs.map((log) => log.taskId));
  return tasks.filter((task) => taskIds.has(task.id) || task.assignedDate===date || task.dueDate===date || task.completedDate===date);
}

function previousIsoDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function dateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function performanceToUser(performance: MemberPerformance): User {
  return {
    id: performance.userId,
    employeeId: performance.employeeId,
    fullName: performance.fullName,
    email: '',
    role: performance.role,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
}

async function selectOrEmpty<T>(
  query: PromiseLike<{
    data: T[] | null;
    error: { code?: string; message: string } | null;
  }>,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    if (error.code === '42P01') return [];
    throw new Error(error.message);
  }
  return data ?? [];
}
