import { codeLabel } from '@/shared/tracker/labels';
import { formatDate, formatDateTime, formatHours } from '@/shared/tracker/format';

import { CHECKLIST_WORDS, MISSION_WORDS, TIME_WORDS, TOOL_WORDS, type Person } from './activity-mapping';

/**
 * Pure parts of the mission change log: `mission_history` rows (migration 70)
 * grouped into one entry per action (one transaction: the command and every
 * row it changed share occurred_at), with a headline and one line per changed
 * value. PRIVATE.
 */

type Change = { before?: unknown; after?: unknown };

/** One row of `public.mission_history`. */
export interface MissionHistoryRow {
  id: number;
  occurred_at: string;
  actor_id: string | null;
  command: string;
  table_name: string;
  row_id: string | null;
  fields: string[] | null;
  /** Row changes: field -> before/after (older rows: only protected columns). */
  changes: Record<string, Change> | null;
  /** Command events: what the command retained. */
  payload: Record<string, unknown> | null;
  /** The checklist row, link, section, person or mission the row is about. */
  label: string | null;
  reason: string | null;
}

export interface MissionChange {
  id: string;
  at: string;
  actor: string;
  /** What was done, in words: "Marked “Site survey” Yes". */
  headline: string;
  /** Every changed value: "Due date: 01 Oct 2026 → 05 Oct 2026". */
  lines: string[];
  reason: string | null;
}

const ROW_EVENTS = new Set(['INSERT', 'UPDATE', 'DELETE']);
// Bookkeeping the database also leaves out of new rows (taskpulse_private.audit_noise), plus mirrors and ids.
const HIDDEN = new Set([
  'id', 'organization_id', 'created_at', 'updated_at', 'metric_version', 'lifecycle_version', 'execution_version',
  'participant_version', 'scale_version', 'freshness', 'valid_for_metrics', 'scaled_progress', 'task_productivity',
  'credit_anchor', 'provider_asset_key', 'reviewed_revision', 'participant_credit_mode', 'storage_path',
  'task_id', 'checklist_id', 'template_id', 'source_timer_id', 'generated_log_id', 'checklist_node_id', 'owner_node_id',
  'is_complete', 'requested_progress_delta', 'effective_progress_delta', 'task_tag', 'score',
  'work_revision', 'productivity_available', 'eligibility_reasons', 'freshness_reason', 'timer_segment_number',
]);
const PEOPLE_FIELDS = new Set([
  'user_id', 'assignee_id', 'reviewer_id', 'completed_by', 'created_by', 'assigned_by', 'updated_by', 'validated_by', 'override_by',
]);
const FIELD_LABEL: Record<string, string> = {
  title: 'Title', status: 'Status', priority: 'Priority', category: 'Type', description: 'Description', comments: 'Comments',
  assignee_id: 'Assignee', reviewer_id: 'Reviewer', task_scale: 'Scale', scale_override: 'Scale', progress_percentage: 'Progress',
  assigned_date: 'Start date', due_date: 'Due date', completed_date: 'Completed on', archived_effective_date: 'Archived on',
  archive_reason: 'Archive reason', completion_state: 'Answer', detail_section: 'Phase', node_type: 'Kind',
  estimated_minutes: 'Estimate', sort_order: 'Position', parent_node_id: 'Placed under', linked_task_id: 'Linked mission',
  completed_by: 'Answered by', completed_at: 'Answered at', hours_worked: 'Hours', progress_delta: 'Progress added',
  update_notes: 'Notes', log_date: 'Date', reversed_at: 'Reversed at', started_at: 'Started', stopped_at: 'Stopped',
  elapsed_seconds: 'Time', notes: 'Notes', url: 'Address', label: 'Name', link_type: 'Kind', content: 'Text',
  share_units: 'Share', is_primary: 'Primary', review_approved: 'Review', reviewed_at: 'Reviewed at', user_id: 'Person',
  ipo_role: 'Folder', progress_owner: 'Progress set by', review_due_at: 'Review due', assignment_role: 'Role',
  reviewer_role: 'Role', key_name: 'Section', initialization_state: 'Set-up', relation_type: 'Kind',
  predecessor_task_id: 'Depends on', successor_task_id: 'Needed by', handoff_successor_id: 'Continued on',
};
const PERCENT_FIELDS = new Set(['progress_percentage', 'progress_delta']);
const PHASES: Record<string, string> = { setup: 'Setup', activity: 'Activity', closure: 'Closure' };
const NOT_SET = 'empty';

const fieldLabel = (field: string) => FIELD_LABEL[field] ?? codeLabel(field);

function duration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return minutes % 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes / 60} h`;
}

/** A retained value in words, or null when it is an id with nothing to show. */
function valueText(field: string, value: unknown, people: ReadonlyMap<string, Person>): string | null {
  if (value === null || value === undefined || value === '') return NOT_SET;
  if (PEOPLE_FIELDS.has(field)) return people.get(String(value))?.fullName ?? 'a former member';
  if (field.endsWith('_id')) return null;
  if (typeof value === 'boolean') {
    if (field === 'review_approved') return value ? 'approved' : 'changes asked';
    return value ? 'Yes' : 'No';
  }
  if (field === 'elapsed_seconds') return duration(Number(value));
  if (field === 'estimated_minutes') return duration(Number(value) * 60);
  if (field === 'hours_worked') return `${formatHours(value as number | string)} h`;
  if (PERCENT_FIELDS.has(field)) return `${Number(value)}%`;
  if (field === 'detail_section') return PHASES[String(value)] ?? String(value);
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(value);
    return field === 'status' || field === 'priority' || field === 'category' || field === 'completion_state' ? value : `“${value}”`;
  }
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

const quoted = (label: string | null) => (label ? `“${label}”` : '');

function subject(row: MissionHistoryRow): string {
  switch (row.table_name) {
    case 'checklist_nodes': return `Row ${quoted(row.label)}`.trim();
    case 'task_assignees': return `Assignee ${row.label ?? ''}`.trim();
    case 'task_reviewers': return `Reviewer ${row.label ?? ''}`.trim();
    case 'task_links': return `Link ${quoted(row.label)}`.trim();
    case 'task_detail_sections': return `Section ${quoted(row.label)}`.trim();
    case 'task_timers': return row.label ? `Timer on ${quoted(row.label)}` : 'Timer';
    case 'daily_task_logs': return 'Time log';
    case 'task_checklists': return 'Checklist';
    case 'task_dependencies': return 'Dependency';
    default: return '';
  }
}

/** The headline of a row change when no command names the action. */
function rowHeadline(row: MissionHistoryRow): string {
  const op = row.command;
  const after = (field: string) => row.changes?.[field]?.after;
  const on = row.label ? ` on ${quoted(row.label)}` : '';
  switch (row.table_name) {
    case 'tasks':
      if (op === 'INSERT') return 'Created the mission';
      if (op === 'DELETE') return 'Deleted the mission';
      return 'Edited the mission';
    case 'checklist_nodes':
      if (op === 'INSERT') return `Added checklist row ${quoted(row.label)}`.trim();
      if (op === 'DELETE') return `Removed checklist row ${quoted(row.label)}`.trim();
      if (typeof after('completion_state') === 'string') return `Marked ${quoted(row.label)} ${after('completion_state')}`.replace('  ', ' ');
      return `Edited checklist row ${quoted(row.label)}`.trim();
    case 'task_assignees':
      if (op === 'INSERT') return `Added ${row.label ?? 'someone'} as an assignee`;
      if (op === 'DELETE') return `Removed ${row.label ?? 'an assignee'} from the mission`;
      return `Changed ${row.label ?? 'an assignee'}'s assignment`;
    case 'task_reviewers':
      if (op === 'INSERT') return `Added ${row.label ?? 'someone'} as a reviewer`;
      if (op === 'DELETE') return `Removed ${row.label ?? 'a reviewer'} as a reviewer`;
      if (row.changes?.review_approved) return after('review_approved') ? 'Approved the mission' : 'Asked for changes';
      return `Changed ${row.label ?? 'a reviewer'}'s review`;
    case 'task_links':
      return op === 'INSERT' ? `Added the link ${quoted(row.label)}`.trim() : op === 'DELETE' ? `Removed the link ${quoted(row.label)}`.trim() : `Edited the link ${quoted(row.label)}`.trim();
    case 'task_detail_sections':
      return `Edited the ${quoted(row.label) || 'mission'} section`.replace('  ', ' ');
    case 'task_checklists':
      return op === 'INSERT' ? 'Started the checklist' : op === 'DELETE' ? 'Removed the checklist' : 'Edited the checklist';
    case 'task_timers':
      if (op === 'INSERT') return `Started the timer${on}`;
      if (after('status') === 'Stopped') return `Stopped the timer${on}`;
      if (after('status') === 'Discarded') return `Discarded the timer${on}`;
      return `Changed the timer${on}`;
    case 'daily_task_logs':
      if (op === 'INSERT') return 'Logged time';
      if (op === 'DELETE') return 'Deleted a time log';
      return row.changes?.reversed_at || row.fields?.includes('reversed_at') ? 'Reversed a time log' : 'Corrected a time log';
    case 'task_dependencies':
      return op === 'DELETE' ? `Removed the link to ${row.label ?? 'another mission'}` : op === 'INSERT' ? `Linked to ${row.label ?? 'another mission'}` : 'Edited a mission link';
    default:
      return codeLabel(op);
  }
}

/** The headline of a command event (task tools, checklist, timer and lifecycle commands). */
function commandHeadline(row: MissionHistoryRow): string {
  const command = row.command;
  const label = quoted(row.label);
  const on = row.label ? ` on ${label}` : '';
  if (command.startsWith('checklist_')) {
    const verb = command.slice('checklist_'.length);
    const state = row.payload?.state ?? (row.payload?.node_after as { state?: unknown } | undefined)?.state;
    if (verb === 'state' && typeof state === 'string') return `Marked ${label || 'a checklist row'} ${state}`;
    if (verb === 'add') return `Added checklist row ${label}`.trim();
    if (verb === 'edit') return `Edited checklist row ${label}`.trim();
    if (verb === 'delete') return label ? `Removed checklist row ${label}` : 'Removed a checklist row';
    return CHECKLIST_WORDS[verb] ?? `Checklist: ${codeLabel(verb).toLowerCase()}`;
  }
  if (command === 'start_timer') return `Started the timer${on}`;
  if (command === 'discard_timer') return `Discarded the timer${on}`;
  if (command === 'stop_timer') return `Stopped the timer and logged the time${on}`;
  if (TIME_WORDS[command]) return TIME_WORDS[command];
  if (MISSION_WORDS[command]) return MISSION_WORDS[command];
  if (command.startsWith('task_tools_')) return TOOL_WORDS[command.slice('task_tools_'.length)] ?? 'Used mission tools';
  if (command === 'detail_link') return 'Added a work file link';
  if (command.startsWith('detail_')) return 'Updated the mission details';
  return codeLabel(command);
}

/** One line per changed value of a row change; created rows list what they were created with. */
function rowLines(row: MissionHistoryRow, people: ReadonlyMap<string, Person>, isHeadline: boolean): string[] {
  if (row.command === 'DELETE') return isHeadline ? [] : [rowHeadline(row)];
  const prefix = row.table_name === 'tasks' || isHeadline ? '' : `${subject(row)} · `;
  const lines: string[] = [];
  const created = row.command === 'INSERT';
  if (created && !isHeadline) lines.push(rowHeadline(row));
  const changes = row.changes ?? {};
  for (const field of row.fields ?? Object.keys(changes)) {
    if (HIDDEN.has(field)) continue;
    const change = changes[field];
    if (created) {
      // What a new row was created with, skipping what the headline already says and empty values.
      if (!change || change.after === null || change.after === '' || change.after === false) continue;
      if (field === 'title' || (row.table_name !== 'tasks' && PEOPLE_FIELDS.has(field)) || field === 'sort_order') continue;
      if (row.table_name === 'task_timers' && field === 'status') continue;
      const after = valueText(field, change.after, people);
      if (after !== null) lines.push(`${prefix}${fieldLabel(field)}: ${after}`);
      continue;
    }
    if (!change) {
      lines.push(`${prefix}${fieldLabel(field)} changed`);
      continue;
    }
    const before = valueText(field, change.before, people);
    const after = valueText(field, change.after, people);
    lines.push(before === null || after === null
      ? `${prefix}${fieldLabel(field)} changed`
      : `${prefix}${fieldLabel(field)}: ${before} → ${after}`);
  }
  return lines;
}

/** Rows (newest first) as one entry per action. */
export function groupMissionHistory(rows: readonly MissionHistoryRow[], people: ReadonlyMap<string, Person>): MissionChange[] {
  const groups = new Map<string, MissionHistoryRow[]>();
  // An update that changed only bookkeeping says nothing (the database already drops most of these).
  const telling = rows.filter((row) => row.command !== 'UPDATE' || (row.fields ?? []).some((field) => !HIDDEN.has(field)));
  for (const row of telling) {
    const group = groups.get(row.occurred_at);
    if (group) group.push(row);
    else groups.set(row.occurred_at, [row]);
  }
  return [...groups.entries()].map(([at, group]) => {
    const ordered = [...group].sort((a, b) => a.id - b.id);
    const command = ordered.find((row) => !ROW_EVENTS.has(row.command));
    const changes = ordered.filter((row) => ROW_EVENTS.has(row.command));
    // Without a command, the first change a person made names the action (the mission row last: its
    // progress usually follows from the others).
    const lead = command ?? changes.find((row) => row.table_name !== 'tasks') ?? changes[0];
    const headline = command ? commandHeadline(command) : rowHeadline(lead);
    const lines = [...new Set(changes.flatMap((row) => rowLines(row, people, !command && row === lead)))]
      .filter((line) => line !== headline);
    const actorId = lead.actor_id;
    return {
      id: String(ordered[0].id),
      at,
      actor: actorId ? people.get(actorId)?.fullName ?? 'A former member' : 'System',
      headline,
      lines,
      reason: ordered.map((row) => row.reason?.trim()).find(Boolean) ?? null,
    };
  });
}
