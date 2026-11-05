import { activitySummary, FIELD_WORDS, type ActivityCursor } from './activity-mapping';

/**
 * Pure parts of a mission's own history (`public.mission_activity`, migration
 * 124): who did what, in words, with names from the recorded rows and the
 * before -> after values the audit kept. Team > Activity uses the same words
 * (`activitySummary`). PRIVATE.
 */

export const MISSION_ACTIVITY_PAGE = 40;

interface Change { before?: unknown; after?: unknown }

/** One row of `public.mission_activity`. */
export interface MissionActivityRow {
  id: string;
  occurred_at: string;
  action: string;
  actor_id: string | null;
  subject_user_id: string | null;
  record_kind: string | null;
  record_id: string | null;
  fields: string[] | null;
  changes: Record<string, Change> | null;
  /** The objective's title, the file's or link's name, the other mission. */
  detail: string | null;
  /** A participant's role (Observer, Collaborator...) or a file's kind. */
  role: string | null;
  reason: string | null;
}

export interface MissionActivityChange { label: string; before: string | null; after: string | null }

export interface MissionActivityEntry {
  /** The first row's id; merged lines keep it. */
  id: string;
  at: string;
  actor: string;
  /** "Padmapriya and Sahana were added to the Mission Crew", "Changed the mission's due date". */
  summary: string;
  detail: string | null;
  changes: MissionActivityChange[];
  reason: string | null;
}

export type MissionActivityPage =
  | { available: true; entries: MissionActivityEntry[]; next: ActivityCursor | null }
  | { available: false };

/** "A", "A and B", "A, B and C". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

const FILE_KIND: Record<string, string> = {
  proof: 'a proof',
  input: 'an Input document',
  process: 'a Process document',
  output: 'an Output document',
};

/** Lines about people, written around their names so several merge into one. */
type PeoplePhrase = (names: string, many: boolean) => string;
const be = (many: boolean) => (many ? 'were' : 'was');
const PEOPLE: Record<string, PeoplePhrase> = {
  crew_added: (n, many) => `${n} ${be(many)} added to the Mission Crew`,
  crew_removed: (n, many) => `${n} ${be(many)} removed from the Crew`,
  observer_added: (n, many) => `${n} ${be(many)} added as ${many ? 'observers' : 'an observer'}`,
  observer_removed: (n, many) => `${n} ${many ? 'are' : 'is'} no longer ${many ? 'observers' : 'an observer'}`,
  reviewer_added: (n, many) => `${n} ${be(many)} added as ${many ? 'reviewers' : 'a reviewer'}`,
  reviewer_removed: (n, many) => `${n} ${many ? 'are' : 'is'} no longer ${many ? 'reviewers' : 'a reviewer'}`,
  share_changed: (n, many) => `${n}'${n.endsWith('s') ? '' : 's'} Crew share${many ? 's' : ''} changed`,
  owner: (n) => `${n} became the mission's owner`,
};

function peopleKey(row: MissionActivityRow): string | null {
  const observer = row.role === 'Observer';
  if (row.record_kind === 'task_assignees') {
    return row.action === 'INSERT' ? 'crew_added' : row.action === 'DELETE' ? 'crew_removed' : 'share_changed';
  }
  if (row.record_kind === 'task_reviewers') {
    if (row.action === 'INSERT') return observer ? 'observer_added' : 'reviewer_added';
    if (row.action === 'DELETE') return observer ? 'observer_removed' : 'reviewer_removed';
    return null;
  }
  switch (row.action) {
    case 'task_people_add_crew':
    case 'task_people_add_collaborator':
      return 'crew_added';
    case 'task_people_remove_crew':
    case 'task_people_remove_collaborator':
      return 'crew_removed';
    case 'task_people_add_observer':
      return 'observer_added';
    case 'task_people_remove_observer':
      return 'observer_removed';
    case 'task_people_transfer_owner':
      return 'owner';
    default:
      return null;
  }
}

const VALUE_LABEL: Record<string, string> = { progress: 'progress', scale: 'scale', share_units: 'share' };

function formatValue(key: string, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (key === 'share_units' && typeof value === 'number') return `${Math.round(value / 1000) / 10}%`;
  if (key === 'progress' && typeof value === 'number') return `${Math.round(value * 10) / 10}%`;
  if (key === 'review_approved' && typeof value === 'boolean') return value ? 'Approved' : 'Not approved';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** The before -> after values worth showing: updates and commands only, never the create/delete snapshot. */
function changesOf(row: MissionActivityRow): MissionActivityChange[] {
  if (!row.changes || row.action === 'INSERT' || row.action === 'DELETE') return [];
  return Object.entries(row.changes)
    .filter(([key]) => !['assignment_role', 'reviewer_role', 'label', 'link_type', 'relation_type'].includes(key))
    .map(([key, change]) => ({
      label: (VALUE_LABEL[key] ?? FIELD_WORDS[key] ?? key.replaceAll('_', ' ')).replace(/^./, (c) => c.toUpperCase()),
      before: formatValue(key, change?.before),
      after: formatValue(key, change?.after),
    }))
    .filter((change) => change.before !== change.after)
    .sort((a, b) => a.label.localeCompare(b.label));
}

function plainSummary(row: MissionActivityRow): string {
  if (row.record_kind === 'tasks' && row.action === 'INSERT') return 'Created the mission';
  if (row.record_kind === 'task_dependencies') return row.action === 'DELETE' ? 'Removed a dependency' : 'Linked a dependency mission';
  if (row.action === 'task_proof_add' || row.action === 'task_proof_withdraw') {
    const kind = FILE_KIND[row.role ?? ''] ?? 'a file';
    return `${row.action === 'task_proof_add' ? 'Added' : 'Removed'} ${kind}`;
  }
  return activitySummary({
    id: row.id,
    occurred_at: row.occurred_at,
    kind: 'missions',
    action: row.action,
    actor_id: row.actor_id,
    subject_user_id: row.subject_user_id,
    task_id: null,
    task_tag: null,
    record_kind: row.record_kind,
    record_id: row.record_id,
    fields: row.fields,
    reason: row.reason,
    period: null,
  });
}

/**
 * Readable lines, newest first. People rows of one save (same time, same
 * person acting, same kind of change) merge into one line that names everyone.
 */
export function mapMissionActivity(
  rows: readonly MissionActivityRow[],
  names: ReadonlyMap<string, string>,
): MissionActivityEntry[] {
  const name = (id: string | null) => (id ? names.get(id) ?? 'Former member' : 'System');
  const entries: MissionActivityEntry[] = [];
  let group: { key: string; at: string; actor: string | null; people: string[]; entry: MissionActivityEntry } | null = null;
  for (const row of rows) {
    const key = peopleKey(row);
    const changes = changesOf(row);
    if (key && row.subject_user_id) {
      const person = name(row.subject_user_id);
      if (group && group.key === key && group.at === row.occurred_at && group.actor === row.actor_id && !changes.length && !group.entry.changes.length) {
        if (!group.people.includes(person)) group.people.push(person);
        group.entry.summary = PEOPLE[key](joinNames(group.people), group.people.length > 1);
        continue;
      }
      const entry: MissionActivityEntry = {
        id: row.id,
        at: row.occurred_at,
        actor: name(row.actor_id),
        summary: PEOPLE[key](person, false),
        detail: null,
        changes,
        reason: row.reason?.trim() || null,
      };
      entries.push(entry);
      group = { key, at: row.occurred_at, actor: row.actor_id, people: [person], entry };
      continue;
    }
    group = null;
    const detail = row.detail?.trim() || null;
    const reason = row.reason?.trim() || null;
    entries.push({
      id: row.id,
      at: row.occurred_at,
      actor: name(row.actor_id),
      // A Quest owner (5 November 2026) is named: "Padmapriya owns the Quest".
      summary: row.action === 'checklist_assign' && row.subject_user_id ? `${name(row.subject_user_id)} owns the Quest` : plainSummary(row),
      detail,
      changes,
      // Labels and files carry their name as the reason; do not repeat it.
      reason: reason && reason !== detail ? reason : null,
    });
  }
  return entries;
}
