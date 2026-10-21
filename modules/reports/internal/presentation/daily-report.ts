import type { DailyTaskLog, Task, User } from '@/types/tracker';
import { formatHours } from '@/shared/tracker/format';
import { roundToNumericScale, sumHours } from '@/modules/time-tracking/client';
import type { LivePresentation } from './model';
import { previousDate } from './context';

/**
 * The member's daily report (the workbook's 2_1 Reports tab): one member's
 * logs for a day and the day before, their open missions, the month's log
 * compilation and attendance validity. A presentation over the live model;
 * it adds no rule.
 */

/** Statuses that still need work. Done, Discarded, Stopped and Carryover are closed. */
const OPEN_STATUSES = new Set<Task['status']>(['Not Started', 'In Progress', 'On-Hold']);
/** Logs listed per day in the share text before the rest fold into "(n more)". */
export const SHARE_LOGS_PER_DAY = 8;
const NOTE_LENGTH = 80;

export interface DailyReportDay {
  date: string;
  logs: DailyTaskLog[];
  hours: number;
}

/**
 * Which Reports tab a URL shows. Daily report is the default; Month close also
 * answers the older `/reports?period=…`, `?asOf=…` and `?revision=…` links.
 */
export function reportsTab(query: { tab?: string; period?: string; asOf?: string; revision?: string }): 'daily' | 'month' {
  if (query.tab === 'month') return 'month';
  if (query.tab === 'daily') return 'daily';
  return query.period || query.asOf || query.revision ? 'month' : 'daily';
}

export type ValidityState = 'valid' | 'invalid' | 'unavailable';

export interface DailyReport {
  member: User;
  date: string;
  today: DailyReportDay;
  yesterday: DailyReportDay;
  /** False when yesterday falls before the loaded month, so its logs are not in this model. */
  yesterdayInPeriod: boolean;
  openMissions: Task[];
  /** Open missions due before the report day. */
  overdueIds: Set<string>;
  /** Mission tags by id, for the logs. */
  tags: Map<string, string>;
  validity: { date: string; state: ValidityState; reasons: string[] }[];
}

export function dailyReport(model: LivePresentation, memberId: string, date: string): DailyReport | null {
  const member = model.members.find((m) => m.id === memberId);
  if (!member) return null;
  const day = (on: string): DailyReportDay => {
    const logs = model.logs.filter((l) => l.userId === memberId && l.logDate === on);
    return { date: on, logs, hours: roundToNumericScale(sumHours(logs)) };
  };
  const openMissions = model.tasks
    .filter((t) => t.assigneeIds.includes(memberId) && openOn(t, date))
    .sort((a, b) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31') || a.taskTag.localeCompare(b.taskTag));
  const yesterday = previousDate(date);
  const attendance = model.attendance.find((a) => a.userId === memberId);
  return {
    member,
    date,
    today: day(date),
    yesterday: day(yesterday),
    yesterdayInPeriod: yesterday >= model.view.period.startDate,
    openMissions,
    overdueIds: new Set(openMissions.filter((t) => t.dueDate !== null && t.dueDate < date).map((t) => t.id)),
    tags: new Map(model.tasks.map((t) => [t.id, t.taskTag])),
    validity: (attendance?.days ?? [])
      .filter((d) => d.businessDate <= date)
      .sort((a, b) => a.businessDate.localeCompare(b.businessDate))
      .map((d) => ({ date: d.businessDate, state: d.valid === null ? 'unavailable' : d.valid ? 'valid' : 'invalid', reasons: d.reasons })),
  };
}

/**
 * Open on the report day: assigned by then, not archived by then, and either
 * still open or finished only after that day. Progress is the current value.
 */
function openOn(task: Task, date: string): boolean {
  if (task.assignedDate && task.assignedDate > date) return false;
  if (task.archivedEffectiveDate && task.archivedEffectiveDate <= date) return false;
  return OPEN_STATUSES.has(task.status) || (task.status === 'Done' && task.completedDate !== null && task.completedDate > date);
}

/** Logs for the compilation table: this member, inclusive date range, newest first. */
export function compiledLogs(model: LivePresentation, memberId: string, from: string, to: string): DailyTaskLog[] {
  return model.logs
    .filter((l) => l.userId === memberId && l.logDate >= from && l.logDate <= to)
    // The live presentation's logs may carry no createdAt.
    .sort((a, b) => b.logDate.localeCompare(a.logDate) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

/**
 * The WhatsApp message for one member's own day: today's and yesterday's logs
 * with hours, then open missions. Bold uses asterisks; lines stay short.
 */
export function dailyReportText(model: LivePresentation, memberId: string, date: string): string {
  const report = dailyReport(model, memberId, date);
  return report ? formatDailyReport(report) : '';
}

/** The share text for a report already built. */
export function formatDailyReport(report: DailyReport): string {
  const { date } = report;
  const lines = [`*Daily report · ${report.member.fullName}*`, longDate(date), ''];
  const day = (title: string, d: DailyReportDay, inPeriod: boolean) => {
    lines.push(`*${title} · ${formatHours(d.hours)} h*`);
    if (!inPeriod) lines.push('Not in this month’s tracker.');
    else if (d.logs.length === 0) lines.push('No task logs.');
    for (const log of d.logs.slice(0, SHARE_LOGS_PER_DAY)) {
      lines.push(`• ${report.tags.get(log.taskId) ?? 'Unknown mission'} · ${formatHours(log.hoursWorked)} h`);
      const note = shortNote(log.updateNotes);
      if (note) lines.push(`  ${note}`);
    }
    if (d.logs.length > SHARE_LOGS_PER_DAY) lines.push(`(${d.logs.length - SHARE_LOGS_PER_DAY} more)`);
    lines.push('');
  };
  day(`Today, ${shortDate(date)}`, report.today, true);
  day(`Yesterday, ${shortDate(report.yesterday.date)}`, report.yesterday, report.yesterdayInPeriod);
  lines.push(`*Open missions (${report.openMissions.length})*`);
  if (report.openMissions.length === 0) lines.push('None open.');
  for (const t of report.openMissions) {
    lines.push(`• ${t.taskTag} · ${t.title}`);
    lines.push(`  ${t.progressPercentage === null ? 'Progress not set' : `${Math.round(t.progressPercentage)}%`} · ${t.dueDate ? `due ${shortDate(t.dueDate)}` : 'no due date'}`);
  }
  return lines.join('\n').trimEnd();
}

function shortNote(note: string | null): string {
  const text = (note ?? '').replace(/\s+/g, ' ').trim();
  return text.length > NOTE_LENGTH ? `${text.slice(0, NOTE_LENGTH - 1).trimEnd()}…` : text;
}

/** "21 Oct" */
export function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** "Tuesday, 21 October 2026" */
export function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
