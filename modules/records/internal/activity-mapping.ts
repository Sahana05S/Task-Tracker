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
  /** What the line is about (migration 128): the objective's or Quest's title, where a note was written. Only for the mission's people. */
  detail?: string | null;
  /** Before -> after values (migration 128): the mission's changed fields, an objective's new title or tick. */
  changes?: Record<string, ActivityValueChange> | null;
}

export interface ActivityValueChange { before?: unknown; after?: unknown }
export interface ActivityChange { label: string; before: string | null; after: string | null }

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
  /** The objective, Quest or note the line is about. */
  detail: string | null;
  /** What changed, before -> after. */
  changes: ActivityChange[];
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
// Meetings (migration 136); the meeting's title arrives as the entry's reason, an added or removed member as "about".
const MEETING_WORDS: Record<string, string> = {
  meeting_create: 'Created a meeting',
  meeting_edit: 'Edited a meeting',
  meeting_save_minutes: 'Saved meeting minutes',
  meeting_add_member: 'Added a member to a meeting',
  meeting_remove_member: 'Removed a member from a meeting',
  meeting_withdraw: 'Withdrew a meeting',
};
// Command names as the log, lifecycle, checklist and Task Tools commands store them.
const TIME_WORDS: Record<string, string> = {
  create_log: 'Logged time',
  correct_log: 'Corrected a time log',
  reverse_log: 'Reversed a time log',
  stop_timer: 'Logged time from a timer',
};
const MISSION_WORDS: Record<string, string> = {
  // Quest owner requests (migration 131); the Quest's title arrives as the reason, the person asked as "about".
  quest_owner_request: 'Asked someone to own a Quest',
  quest_owner_cancel: 'Cancelled a Quest owner request',
  quest_owner_accept: 'Accepted a Quest and joined the Crew',
  quest_owner_decline: 'Declined to own a Quest',
  save_task_with_participants: 'Saved the mission and its assignees',
  transition: "Changed the mission's status",
  progress: "Updated the mission's progress",
  scale: "Set the mission's scale",
  review: 'Reviewed the mission',
  initialize_native_details: 'Set up the mission details',
  publish_detail_template: 'Published a details template',
  // Mission people (migration 108; Crew from 5 November 2026). The member arrives as the entry's "about".
  task_people_add_crew: 'Added a member to the Mission Crew',
  task_people_remove_crew: 'Removed a member from the Mission Crew',
  task_people_add_collaborator: 'Added a member to the Mission Crew',
  task_people_remove_collaborator: 'Removed a member from the Mission Crew',
  task_people_add_observer: 'Added an observer',
  task_people_remove_observer: 'Removed an observer',
  task_people_transfer_owner: 'Handed the mission to a new owner',
  // Mission files (migration 124); the file's name arrives as the entry's reason.
  task_proof_add: 'Added a mission file',
  task_proof_withdraw: 'Removed a mission file',
};
const CHECKLIST_WORDS: Record<string, string> = {
  create: 'Started a checklist',
  add: 'Added a checklist objective',
  edit: 'Edited a checklist objective',
  state: 'Updated a checklist objective',
  map: 'Linked a checklist objective',
  section: 'Moved a checklist objective',
  mode: 'Changed how a checklist works',
  delete: 'Removed a checklist objective',
  duplicate: 'Copied a checklist objective',
  reorder: 'Reordered a checklist objective',
  // 'submission' creates a Quest (migration 67).
  submission: 'Added a Quest',
  // Migration 114: the decision and its note arrive as the entry's reason.
  review: 'Reviewed a checklist objective',
  // Migration 122: a Quest's owner was set or changed; the member arrives as the entry's "about".
  assign: 'Chose a Quest owner',
};
// Notes (migration 126; the 111 commands read the same). The note's hashtags arrive as the reason
// ("#mistake #client") and become part of the line: "Added a note #mistake #client".
const NOTE_WORDS: Record<string, string> = {
  mission_note_add: 'Added a note',
  mission_note_edit: 'Edited a note',
  mission_note_delete: 'Deleted a note',
  mission_learning_add: 'Added a note',
  mission_learning_edit: 'Edited a note',
  mission_learning_withdraw: 'Deleted a note',
};
/** A note line carries its hashtags in the summary, not as a separate reason. */
export const isNoteAction = (action: string): boolean => action in NOTE_WORDS;
function noteHashtags(reason: string | null): string {
  const text = reason?.trim() ?? '';
  // Lines written before migration 126 name only the kind ('mistake' / 'learning') on the mission's History.
  return text === 'mistake' || text === 'learning' ? `#${text}` : text;
}
// Labels (migration 112, listed from 116); the label's name arrives as the entry's reason ("#Crane").
const LABEL_WORDS: Record<string, string> = {
  label_create: 'Created a label',
  label_rename: 'Renamed a label',
  label_archive: 'Archived a label',
  label_restore: 'Restored a label',
  label_link_attach: 'Added a label',
  label_link_detach: 'Removed a label',
  // Note types (migration 126), chosen in Settings > Company.
  label_note_type_on: 'Made a label a note type',
  label_note_type_off: 'Stopped using a label as a note type',
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
  task_assignees: { INSERT: 'Added a member to the Mission Crew', DELETE: 'Removed a member from the Mission Crew', UPDATE: 'Changed a Crew share' },
  task_reviewers: { INSERT: 'Added a reviewer', DELETE: 'Removed a reviewer', UPDATE: 'Changed a review' },
  task_dependencies: { INSERT: 'Linked two missions', DELETE: 'Removed a mission link' },
  task_links: { INSERT: 'Added a link', DELETE: 'Removed a link' },
  company_statements: { INSERT: 'Added a company statement', UPDATE: 'Edited a company statement', DELETE: 'Removed a company statement' },
  company_milestones: { INSERT: 'Added a milestone', UPDATE: 'Edited a milestone', DELETE: 'Removed a milestone' },
  report_snapshots: { INSERT: 'Saved a report', UPDATE: 'Edited a saved report', DELETE: 'Deleted a saved report' },
};
export const FIELD_WORDS: Record<string, string> = {
  status: 'status', priority: 'priority', title: 'title', category: 'type', assignee_id: 'assignee', reviewer_id: 'reviewer',
  assigned_date: 'start date', due_date: 'due date', completed_date: 'completion date', task_scale: 'scale',
  scale_override: 'scale', archived_effective_date: 'archive date', is_primary: 'primary assignee', share_units: 'share',
  review_approved: 'review',
};
const VALUE_LABEL: Record<string, string> = { progress: 'progress', scale: 'scale', share_units: 'share', state: 'tick' };
// An objective's tick as the interface says it (only Yes and N/A are offered; 'No' shows empty).
const TICK_WORDS: Record<string, string> = { Yes: 'Done', No: 'Not done', 'N/A': 'N/A' };

function formatValue(key: string, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (key === 'state' && typeof value === 'string') return TICK_WORDS[value] ?? value;
  if (key === 'share_units' && typeof value === 'number') return `${Math.round(value / 1000) / 10}%`;
  if (key === 'progress' && typeof value === 'number') return `${Math.round(value * 10) / 10}%`;
  if (key === 'review_approved' && typeof value === 'boolean') return value ? 'Approved' : 'Not approved';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** Before -> after values in words, sorted by label; unchanged values and role/link keys are left out. */
export function changeList(changes: Readonly<Record<string, ActivityValueChange>> | null | undefined): ActivityChange[] {
  if (!changes) return [];
  return Object.entries(changes)
    .filter(([key]) => !['assignment_role', 'reviewer_role', 'label', 'link_type', 'relation_type'].includes(key))
    .map(([key, change]) => ({
      label: (VALUE_LABEL[key] ?? FIELD_WORDS[key] ?? key.replaceAll('_', ' ')).replace(/^./, (c) => c.toUpperCase()),
      before: formatValue(key, change?.before),
      after: formatValue(key, change?.after),
    }))
    .filter((change) => change.before !== change.after)
    .sort((a, b) => a.label.localeCompare(b.label));
}

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
  retire_role: 'Moved to Team Member (roles simplified)',
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
/**
 * Roles that see the whole company's activity and may filter by any member (the
 * database's own rule). Since migration 120 a project engineer's mission lines
 * are only those of missions they are on; the database applies that.
 */
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

/** What an `activity_feed` row did, in words ("Added a mission file"). Mission Activity uses the same words. */
export function activitySummary(row: ActivityRow): string {
  const action = row.action;
  if (row.kind === 'records') {
    if (row.record_kind === 'meetings') return MEETING_WORDS[action] ?? 'Changed a meeting';
    return `${RECORD_VERB[action] ?? codeLabel(action)} ${RECORD_NOUN[row.record_kind ?? ''] ?? 'a record'}`;
  }
  if (row.kind === 'time') return TIME_WORDS[action] ?? codeLabel(action);
  if (row.kind === 'month') return MONTH_WORDS[action] ?? codeLabel(action);
  if (row.kind === 'people') return PEOPLE_WORDS[action] ?? codeLabel(action);
  if (action.startsWith('company_settings_')) return settingsSection(action)?.words ?? 'Changed company settings';
  if (NOTE_WORDS[action]) return `${NOTE_WORDS[action]} ${noteHashtags(row.reason)}`.trim();
  if (action === 'UPDATE' && row.kind === 'missions') {
    const changed = [...new Set((row.fields ?? []).map((field) => FIELD_WORDS[field] ?? codeLabel(field).toLowerCase()))];
    return changed.length ? `Changed the mission's ${changed.join(', ')}` : 'Edited a mission';
  }
  const word = ROW_WORDS[row.record_kind ?? '']?.[action];
  if (word) return word;
  if (MISSION_WORDS[action]) return MISSION_WORDS[action];
  if (LABEL_WORDS[action]) return LABEL_WORDS[action];
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
  if (row.record_kind === 'meetings' && row.record_id) return { href: `/meeting-points/${row.record_id}`, label: 'Meeting' };
  if (row.kind === 'records' && row.record_kind && row.record_id) {
    return { href: `/records/${row.record_kind}/${row.record_id}/history`, label: 'History' };
  }
  if (row.kind === 'month' && row.period) return { href: `/reports?tab=month&period=${row.period.slice(0, 7)}`, label: 'Month close' };
  if (row.action.startsWith('company_settings_')) {
    const section = settingsSection(row.action);
    return { href: `/settings?tab=company${section ? `#${section.anchor}` : ''}`, label: 'Company settings' };
  }
  if (row.task_tag) return { href: `/tasks/${encodeURIComponent(row.task_tag)}`, label: row.task_tag };
  if (row.record_kind === 'labels' || row.record_kind === 'label_links') return { href: '/labels', label: 'Labels' };
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
    summary: activitySummary(row),
    actor: name(row.actor_id),
    about: row.subject_user_id && row.subject_user_id !== row.actor_id ? name(row.subject_user_id) : null,
    href: target?.href ?? null,
    linkLabel: target?.label ?? null,
    reason: isNoteAction(row.action) || (row.detail && row.reason?.trim() === row.detail) ? null : row.reason?.trim() || null,
    detail: row.detail?.trim() || null,
    changes: row.action === 'INSERT' || row.action === 'DELETE' ? [] : changeList(row.changes),
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
    const what = [
      entry.detail ? `${entry.summary}: ${entry.detail}` : entry.summary,
      ...entry.changes.map((change) => `${change.label}: ${change.before ?? 'none'} → ${change.after ?? 'none'}`),
    ].join('; ');
    return [date, time, ACTIVITY_KIND_LABEL[entry.kind], entry.actor, what, entry.about ?? '', entry.reason ?? '', entry.href ?? ''];
  });
  return [header, ...lines].map((line) => line.map(csvCell).join(',')).join('\r\n');
}
