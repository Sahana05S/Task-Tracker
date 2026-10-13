import { optionalEmployeePerformance } from '@/lib/team/performance-availability';
import { getTaskWorkspaceData } from '@/lib/tasks/queries';
import { getTeamSummaryInputs } from '@/lib/analytics/summary-inputs';
import { getCurrentProfile } from '@/lib/auth/profile';
import { canViewEmployeeReports } from '@/lib/team/permissions';
import {
  currentPeriod,
  type AnalyticsPeriod,
  type MemberPerformance,
} from '@/lib/analytics/engine';
import { getTeamAnalytics } from '@/lib/analytics/queries';
import {
  ATTENDANCE_COLUMNS,
  mapAttendanceRecords,
} from '@/lib/attendance/mappers';
import { summarizeAttendance, type AttendanceSummary } from '@/lib/attendance/summary';
import { LOG_COLUMNS, mapDailyTaskLogs } from '@/lib/logs/mappers';
import { sumHours } from '@/lib/logs/metrics';
import { mapUser, USER_COLUMNS } from '@/lib/supabase/mappers';
import { createClient } from '@/lib/supabase/server';
import {
  getSupportModuleData,
  summarizeEmployeeSupport,
  type EmployeeSupportSummary,
  type SupportSummary,
} from '@/lib/support/queries';
import {
  buildEmployeeAnalyticsCharts,
  type EmployeeAnalyticsCharts,
} from '@/lib/team/employee-charts';
import {
  mapTasks,
  TASK_COLUMNS,
  withTaskParticipants,
} from '@/lib/tasks/mappers';
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
  readonly period: AnalyticsPeriod;
  readonly members: readonly TeamIndexMember[];
  readonly supportSummary: SupportSummary;
}

export interface EmployeeProfileData {
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
): Promise<TeamIndexData> {
  const supabase = await createClient();
  const [analytics, supportData, summaryInputs] = await Promise.all([
    getTeamAnalytics(period),
    getSupportModuleData(period),
    getTeamSummaryInputs(period),
  ]);
  const userIds = analytics.members.map((member) => member.userId);

  const starRows = userIds.length === 0 ? [] : await selectOrEmpty(
    supabase.from('daily_star_records').select(DAILY_STAR_COLUMNS).in('user_id', userIds)
      .gte('star_date', period.startDate).lte('star_date', period.endDate),
  );
  const stars = mapDailyStarRecords(starRows);

  return {
    period,
    members: analytics.members.map((performance) => ({
      user: performanceToUser(performance),
      performance,
      dailyStarCount: stars.filter((star) => star.userId === performance.userId)
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

  const {performance,performanceUnavailableReason}=await optionalEmployeePerformance(()=>getTeamAnalytics(period),employee.id);
  const [tasks, logs, stars, attendance, reports] = await Promise.all([
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

  const mappedLogs = mapDailyTaskLogs(logs);
  const mappedAttendance = mapAttendanceRecords(attendance);
  const taskLinks = await getTaskLinks(tasks.map((task) => task.id));
  const supportData = await getSupportModuleData(period);
  const today = dateInTimeZone(now, 'Asia/Kolkata');
  const yesterday = previousIsoDate(today);
  const todayLogs = mappedLogs.filter((log) => log.logDate === today);
  const yesterdayLogs = mappedLogs.filter((log) => log.logDate === yesterday);
  const mappedStars = mapDailyStarRecords(stars);

  return {
    period,
    employee,
    performance,
    performanceUnavailableReason,
    tasks,
    taskLinks,
    logs: mappedLogs,
    todayLogs,
    yesterdayLogs,
    todayTasks: tasksForLogs(tasks, todayLogs),
    yesterdayTasks: tasksForLogs(tasks, yesterdayLogs),
    stars: mappedStars,
    attendance: mappedAttendance,
    attendanceSummary: summarizeAttendance(mappedAttendance),
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
): Promise<EmployeeReportsData | null> {
  const supabase = await createClient();
  const employee = await getEmployeeByEmployeeId(employeeId);
  const viewer = await getCurrentProfile();
  if (!employee || !viewer || !canViewEmployeeReports(viewer, employee)) return null;

  const {performance,performanceUnavailableReason}=await optionalEmployeePerformance(()=>getTeamAnalytics(period),employee.id);
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

  return {
    period,
    employee,
    performance,
    performanceUnavailableReason,
    reports: mapReportSnapshots(reports),
    scoreComponents: mapPerformanceScoreComponents(components),
    stars: mapDailyStarRecords(stars),
    attendanceSummary: summarizeAttendance(mapAttendanceRecords(attendance)),
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

function tasksForLogs(
  tasks: readonly Task[],
  logs: readonly DailyTaskLog[],
): Task[] {
  const taskIds = new Set(logs.map((log) => log.taskId));
  return tasks.filter((task) => taskIds.has(task.id));
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
