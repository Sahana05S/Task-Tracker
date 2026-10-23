import { ISO_DATE_PATTERN, UUID_PATTERN } from '@/shared/forms/form-data';
import { csvCell } from '@/shared/tracker/csv';
import { codeLabel } from '@/shared/tracker/labels';
import { kolkataDate, kolkataTime } from '@/shared/time/kolkata';
import type { UserRole } from '@/types/tracker';

/**
 * Pure parts of the activity log: the URL filter, plain wording and links for
 * `activity_feed` rows (migration 54), and the CSV. PRIVATE.
 */

export const ACTIVITY_KINDS = ['missions', 'records', 'time', 'people', 'month', 'company'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const ACTIVITY_KIND_LABEL: Record<ActivityKind | 'other', string> = {
  missions: 'Missions',
  records: 'Records',
  time: 'Time',
  people: 'People',
  month: 'Month close',
  company: 'Company',
  other: 'Other',
};
/** Longest date range one read covers (the database refuses more). */
export const ACTIVITY_MAX_DAYS = 93;
export const ACTIVITY_PAGE = 50;
/** Largest page: one under the database's 200-row cap, so one extra row can show whether more follow. */
export const ACTIVITY_MAX_PAGE = 199;

/** One row of `public.activity_feed`. */
export interface ActivityRow {
  id: string;
  occurred_at: string;
  kind: string;
  action: string;
  actor_id: string | null;
  subject_user_id: string | null;
  task_id: string | null;
  task_tag: string | null;
  record_kind: string | null;
  record_id: string | null;
  fields: string[] | null;
  reason: string | null;
  period: string | null;
}

export interface ActivityEntry {
  id: string;
  at: string;
  kind: ActivityKind | 'other';
  /** What happened, in words: "Reviewed a daily fact". */
  summary: string;
  /** Who did it. */
  actor: string;
  /** Whose record it was, when that is someone else. */
  about: string | null;
  /** Where to look: the mission, the record's history, the month. */
  href: string | null;
  linkLabel: string | null;
  reason: string | null;
}

export interface ActivityFilter { from: string; to: string; kind: ActivityKind | null; member: string | null }
export interface ActivityCursor { at: string; id: string }
export interface Person { id: string; fullName: string; employeeId: string | null }

const RECORD_NOUN: Record<string, string> = {
  attendance: 'an attendance record',
  fact: 'a daily fact',
  idea: 'an idea',
  suggestion: 'a suggestion',
  sale: 'a sale',
  meeting: 'a meeting point',
};
const RECORD_VERB: Record<string, string> = { save: 'Saved', correct: 'Corrected', validate: 'Reviewed', withdraw: 'Withdrew' };
// Command names as the log, lifecycle, checklist and Task Tools commands store them.
const TIME_WORDS: Record<string, string> = {
  create_log: 'Logged time',
  correct_log: 'Corrected a time log',
  reverse_log: 'Reversed a time log',
  stop_timer: 'Logged time from a timer',
};
const MISSION_WORDS: Record<string, string> = {
  save_task_with_participants: 'Saved the mission and its assignees',
  transition: "Changed the mission's status",
  progress: "Updated the mission's progress",
  scale: "Set the mission's scale",
  review: 'Reviewed the mission',
  initialize_native_details: 'Set up the mission details',
  publish_detail_template: 'Published a details template',
};
const CHECKLIST_WORDS: Record<string, string> = {
  create: 'Started a checklist',
  add: 'Added a checklist item',
  edit: 'Edited a checklist item',
  state: 'Updated a checklist item',
  map: 'Linked a checklist item',
  section: 'Moved a checklist item',
  mode: 'Changed how a checklist works',
  delete: 'Removed a checklist item',
  duplicate: 'Copied a checklist item',
  submission: 'Submitted a checklist',
};
const TOOL_WORDS: Record<string, string> = {
  bulk_done: 'Marked missions done',
  bulk_reopen: 'Reopened missions',
  section: 'Moved missions to another section',
  archive: 'Archived missions',
  carryover: 'Carried missions over',
  support: 'Added support missions',
  duplicate: 'Copied missions',
  weekly: 'Copied missions week by week',
  day_count: 'Copied missions by day count',
  all_team: 'Copied a mission to the whole team',
  number_suffix: 'Copied missions with numbered names',
};
const MONTH_WORDS: Record<string, string> = {
  month_draft: 'Drafted the month report',
  month_close: 'Closed the month',
  month_begin_correction: 'Opened a month correction',
  month_revise: 'Revised the month',
};
const ROW_WORDS: Record<string, Record<string, string>> = {
  tasks: { INSERT: 'Created a mission', DELETE: 'Deleted a mission' },
  task_assignees: { INSERT: 'Added an assignee', DELETE: 'Removed an assignee', UPDATE: 'Changed an assignee share' },
  task_reviewers: { INSERT: 'Added a reviewer', DELETE: 'Removed a reviewer', UPDATE: 'Changed a review' },
  task_dependencies: { INSERT: 'Linked two missions', DELETE: 'Removed a mission link' },
  task_links: { INSERT: 'Added a link', DELETE: 'Removed a link' },
  company_statements: { INSERT: 'Added a company statement', UPDATE: 'Edited a company statement', DELETE: 'Removed a company statement' },
  company_milestones: { INSERT: 'Added a milestone', UPDATE: 'Edited a milestone', DELETE: 'Removed a milestone' },
  report_snapshots: { INSERT: 'Saved a report', UPDATE: 'Edited a saved report', DELETE: 'Deleted a saved report' },
};
const FIELD_WORDS: Record<string, string> = {
  status: 'status', priority: 'priority', title: 'title', category: 'type', assignee_id: 'assignee', reviewer_id: 'reviewer',
  assigned_date: 'start date', due_date: 'due date', completed_date: 'completion date', task_scale: 'scale',
  scale_override: 'scale', archived_effective_date: 'archive date', is_primary: 'primary assignee', share_units: 'share',
  review_approved: 'review',
};
// Settings > Company saves (migration 53, listed from migration 59): section -> words and page anchor.
const COMPANY_SETTINGS: Record<string, { words: string; anchor: string }> = {
  agenda: { words: 'Changed the meeting agenda', anchor: 'agenda' },
  categories: { words: 'Changed the mission types', anchor: 'mission-types' },
  meeting_types: { words: 'Changed the meeting types', anchor: 'meeting-types' },
  standing_missions: { words: 'Changed the standing missions', anchor: 'standing-missions' },
  holidays: { words: 'Changed the holiday calendar', anchor: 'holidays' },
  departments: { words: 'Changed the departments', anchor: 'departments' },
  mission_defaults: { words: 'Changed how new missions are weighted', anchor: 'mission-defaults' },
};
const settingsSection = (action: string) =>
  action.startsWith('company_settings_') ? COMPANY_SETTINGS[action.slice('company_settings_'.length)] : undefined;
const PEOPLE_WORDS: Record<string, string> = {
  invite_member: 'Invited a member',
  revoke_invitation: 'Withdrew an invitation',
  accept_invitation: 'Joined the company',
  change_role: 'Changed a role',
  update_member: 'Edited member details',
  deactivate_member: 'Deactivated a member',
  reactivate_member: 'Reactivated a member',
};

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
const validDate = (value: string | null | undefined): value is string =>
  Boolean(value && ISO_DATE_PATTERN.test(value) && addDays(value, 0) === value);
const TEAM_ROLES: readonly UserRole[] = ['managing_director', 'project_engineer'];
/** Roles that see the whole company's activity (the database's own rule). */
export const seesAllActivity = (role: UserRole): boolean => TEAM_ROLES.includes(role);

/**
 * The filter from URL values: the last 7 days by default, a reversed range
 * swapped, at most ACTIVITY_MAX_DAYS (keeping the latest days), an unknown
 * kind ignored, and members always limited to themselves.
 */
export function activityFilter(
  query: { from?: string | null; to?: string | null; kind?: string | null; member?: string | null },
  today: string,
  viewer: { id: string; role: UserRole },
): ActivityFilter {
  let to = validDate(query.to) ? query.to : today;
  let from = validDate(query.from) ? query.from : addDays(to, -6);
  if (from > to) [from, to] = [to, from];
  if (addDays(from, ACTIVITY_MAX_DAYS - 1) < to) from = addDays(to, -(ACTIVITY_MAX_DAYS - 1));
  const kind = (ACTIVITY_KINDS as readonly string[]).includes(query.kind ?? '') ? (query.kind as ActivityKind) : null;
  const member = !seesAllActivity(viewer.role) ? viewer.id : query.member && UUID_PATTERN.test(query.member) ? query.member : null;
  return { from, to, kind, member };
}

/** Reads `before` (`<ISO time>~<row id>`) from the URL; anything malformed means the first page. */
export function parseCursor(value: string | null | undefined): ActivityCursor | null {
  const [at, id] = (value ?? '').split('~');
  return at && id && !Number.isNaN(Date.parse(at)) ? { at, id } : null;
}
export const cursorParam = (cursor: ActivityCursor): string => `${cursor.at}~${cursor.id}`;

function summary(row: ActivityRow): string {
  const action = row.action;
  if (row.kind === 'records') {
    return `${RECORD_VERB[action] ?? codeLabel(action)} ${RECORD_NOUN[row.record_kind ?? ''] ?? 'a record'}`;
  }
  if (row.kind === 'time') return TIME_WORDS[action] ?? codeLabel(action);
  if (row.kind === 'month') return MONTH_WORDS[action] ?? codeLabel(action);
  if (row.kind === 'people') return PEOPLE_WORDS[action] ?? codeLabel(action);
  if (action.startsWith('company_settings_')) return settingsSection(action)?.words ?? 'Changed company settings';
  if (action === 'UPDATE' && row.kind === 'missions') {
    const changed = [...new Set((row.fields ?? []).map((field) => FIELD_WORDS[field] ?? codeLabel(field).toLowerCase()))];
    return changed.length ? `Changed the mission's ${changed.join(', ')}` : 'Edited a mission';
  }
  const word = ROW_WORDS[row.record_kind ?? '']?.[action];
  if (word) return word;
  if (MISSION_WORDS[action]) return MISSION_WORDS[action];
  if (action.startsWith('checklist_')) {
    const command = action.slice('checklist_'.length);
    return CHECKLIST_WORDS[command] ?? `Checklist: ${codeLabel(command).toLowerCase()}`;
  }
  if (action.startsWith('task_tools_')) {
    const command = action.slice('task_tools_'.length);
    return TOOL_WORDS[command] ?? `Mission tools: ${codeLabel(command).toLowerCase()}`;
  }
  if (action.startsWith('detail_')) return 'Updated mission details';
  return codeLabel(action);
}

function link(row: ActivityRow, people: ReadonlyMap<string, Person>): { href: string; label: string } | null {
  if (row.kind === 'records' && row.record_kind && row.record_id) {
    return { href: `/records/${row.record_kind}/${row.record_id}/history`, label: 'History' };
  }
  if (row.kind === 'month' && row.period) return { href: `/reports?tab=month&period=${row.period.slice(0, 7)}`, label: 'Month close' };
  if (row.action.startsWith('company_settings_')) {
    const section = settingsSection(row.action);
    return { href: `/settings?tab=company${section ? `#${section.anchor}` : ''}`, label: 'Company settings' };
  }
  if (row.task_tag) return { href: `/tasks/${encodeURIComponent(row.task_tag)}`, label: row.task_tag };
  const subject = row.subject_user_id ? people.get(row.subject_user_id) : undefined;
  if (row.kind === 'people' && subject?.employeeId) return { href: `/team/${encodeURIComponent(subject.employeeId)}`, label: 'Profile' };
  return null;
}

export function mapActivity(row: ActivityRow, people: ReadonlyMap<string, Person>): ActivityEntry {
  const name = (id: string | null) => (id ? people.get(id)?.fullName ?? 'Former member' : 'System');
  const target = link(row, people);
  return {
    id: row.id,
    at: row.occurred_at,
    kind: (ACTIVITY_KINDS as readonly string[]).includes(row.kind) ? (row.kind as ActivityKind) : 'other',
    summary: summary(row),
    actor: name(row.actor_id),
    about: row.subject_user_id && row.subject_user_id !== row.actor_id ? name(row.subject_user_id) : null,
    href: target?.href ?? null,
    linkLabel: target?.label ?? null,
    reason: row.reason?.trim() || null,
  };
}

/** Asia/Kolkata date and time of an entry, for grouping and the CSV. */
export function kolkataParts(at: string): { date: string; time: string } {
  const instant = new Date(at);
  return { date: kolkataDate(instant), time: kolkataTime(instant) };
}

export function activityCsv(entries: readonly ActivityEntry[]): string {
  const header = ['Date', 'Time (Asia/Kolkata)', 'Kind', 'Who', 'What', 'About', 'Reason', 'Link'];
  const lines = entries.map((entry) => {
    const { date, time } = kolkataParts(entry.at);
    return [date, time, ACTIVITY_KIND_LABEL[entry.kind], entry.actor, entry.summary, entry.about ?? '', entry.reason ?? '', entry.href ?? ''];
  });
  return [header, ...lines].map((line) => line.map(csvCell).join(',')).join('\r\n');
}
