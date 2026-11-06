import type { ChecklistBranchRow } from './branch-types';
import { CHECKLIST_SECTIONS, type ChecklistNodeProgress, type ChecklistRollup, type ChecklistSection, type CompletionState, type SectionProgress } from './progress';

/**
 * Pure rules for the checklist tables (the sheet's Checklist Home and "[ChL]"
 * tabs). Server-safe and client-safe; no data access.
 */

export type ChecklistRowKind = 'item' | 'parent' | 'linked' | 'quest';

export const SECTION_TITLES: Record<ChecklistSection, { title: string; note: string }> = {
  setup: { title: 'Setup', note: '2.5% of progress · done before the work starts' },
  activity: { title: 'Activity', note: '95% of mission progress' },
  closure: { title: 'Closure', note: '2.5% of progress · done before the mission closes' },
};

/**
 * How a row behaves (migration 63: one kind of row). A row linked to a real
 * mission follows that mission and stays a leaf; any other row with rows under
 * it rolls up from them and opens their table; otherwise it is ticked.
 */
export function rowKind(row: Pick<ChecklistBranchRow, 'nodeType' | 'linkedTaskId' | 'childCount'> & { ownedChecklistId?: string | null }): ChecklistRowKind {
  if (row.ownedChecklistId) return 'quest';
  if (row.linkedTaskId || row.nodeType === 'Task') return 'linked';
  if (row.childCount > 0) return 'parent';
  return 'item';
}

/** Rows that open a nested table (a parent) or their own checklist (a Quest). */
export const opensTable = (kind: ChecklistRowKind) => kind === 'parent' || kind === 'quest';

/**
 * The stored "not done" value (user decision, 4 November 2026: "No" means
 * nothing, so it is never offered). An unticked objective is shown empty and
 * clearing a tick sends this; the database default and the rollup stay as
 * they were, so progress is unchanged.
 */
export const NOT_DONE: CompletionState = 'No';

/**
 * Completion choices a row offers: Yes and N/A for an objective (tapping the
 * chosen one again clears it); only N/A for a linked sub-mission, whose
 * completion follows that mission (clearing restores it). Rows with rows under
 * them offer none.
 */
export function stateChoices(kind: ChecklistRowKind): readonly CompletionState[] {
  if (kind === 'item') return ['Yes', 'N/A'];
  if (kind === 'linked') return ['N/A'];
  return [];
}

/** The state a tap leaves: the choice, or not done when it was already chosen. */
export function nextCompletionState(current: CompletionState | null | undefined, tapped: CompletionState): CompletionState {
  return current === tapped ? NOT_DONE : tapped;
}

/** A completion state in words ("Not done" for the stored No). */
export function completionWords(state: CompletionState | null | undefined): string {
  return state === 'Yes' ? 'Yes' : state === 'N/A' ? 'N/A' : 'Not done';
}

export type ProgressStatusTone = 'done' | 'active' | 'idle' | 'alert';

/**
 * Where a Quest, a row with rows under it or a sub-mission stands: Not
 * applicable, Complete, Changes needed (an objective inside was sent back by a
 * reviewer), In progress (something is done) or Not started (0%).
 */
export function rowStatus(
  row: { applicable: boolean; isComplete: boolean; progressPercentage: number | null },
  changesNeeded = false,
): { label: 'Not applicable' | 'Complete' | 'Changes needed' | 'In progress' | 'Not started'; tone: ProgressStatusTone } {
  if (!row.applicable) return { label: 'Not applicable', tone: 'done' };
  if (row.isComplete) return { label: 'Complete', tone: 'done' };
  if (changesNeeded) return { label: 'Changes needed', tone: 'alert' };
  if ((row.progressPercentage ?? 0) > 0) return { label: 'In progress', tone: 'active' };
  return { label: 'Not started', tone: 'idle' };
}

/** OPEN / CLOSED / N/A for a page, as on the sheet's "[ChL]" tabs. */
export function pageResult(progress: Pick<ChecklistNodeProgress, 'applicable' | 'isComplete'> | null | undefined): 'OPEN' | 'CLOSED' | 'N/A' {
  if (progress?.applicable === false) return 'N/A';
  return progress?.isComplete ? 'CLOSED' : 'OPEN';
}

/**
 * Short state for a section header. An unfinished section says Not started at
 * 0%, Changes needed when an objective in it was sent back (review
 * `work_needed`, migration 114) and In progress only once something is done.
 */
export function sectionStatus(section: SectionProgress, changesNeeded = false): { label: string; tone: ProgressStatusTone } {
  switch (section.state) {
    case 'complete': return { label: 'Complete', tone: 'done' };
    case 'not_applicable': return { label: 'No rows (N/A)', tone: 'done' };
    case 'partial': {
      const { label, tone } = rowStatus({ applicable: true, isComplete: false, progressPercentage: section.progressPercentage }, changesNeeded);
      return { label, tone };
    }
    // Older databases only (before migration 63).
    case 'uninitialized': return { label: 'Not confirmed yet', tone: 'idle' };
    case 'missing': return { label: 'Not set up', tone: 'idle' };
    case 'invalid': return { label: 'Needs attention', tone: 'alert' };
  }
}

/** Percentage text, or null when there is no figure to show. */
export function percentText(value: number | null | undefined): string | null {
  return value === null || value === undefined || !Number.isFinite(value) ? null : `${Math.round(value)}%`;
}

const ISSUES: Record<string, string> = {
  duplicate_node: 'A row appears twice in this checklist.',
  unsectioned: 'A row has no section yet; a manager must map it to Setup, Activity or Closure.',
  missing_parent: 'A row sits under a row that no longer exists.',
  cross_section: 'A row sits under a row in a different section.',
  missing_or_cross_parent: 'A row sits under a row that no longer exists or is in a different section.',
  cycle: 'Two rows sit under each other.',
  checklist_cycle: 'Two checklists contain each other.',
  missing_node: 'A row was removed while the checklist was being read; reload the page.',
  linked_unavailable: 'A row linked to a mission cannot read that mission’s progress.',
  linked_parent: 'A row linked to a mission also has rows under it.',
  linked_done_mismatch: 'A linked mission is Done but not at 100%.',
  // Older databases only (before migration 63).
  empty_group: 'A page has no rows yet; add rows or mark it N/A.',
  empty_unconfirmed: 'A section was confirmed but has no rows.',
};

/** Rollup error codes ("unsectioned:<id>") as sentences, deduplicated. */
export function checklistIssues(errors: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const error of errors) seen.add(ISSUES[error.split(':')[0]] ?? 'Part of this checklist could not be read.');
  return [...seen];
}

/** The `version` a checklist command reports, or null. */
export function commandVersion(data: unknown): number | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const version = (data as { version?: unknown }).version;
  return typeof version === 'number' && Number.isFinite(version) ? version : null;
}

/**
 * OPEN / CLOSED for a whole checklist (the sheet's Checklist Home): progress
 * weighs Activity 95, Setup 2.5 and Closure 2.5 (migration 85), but the
 * checklist is closed only once every phase is
 * complete or N/A. Lists the phases still open.
 */
export function checklistGate(rollup: Pick<ChecklistRollup, 'sections' | 'isComplete' | 'errors'>): { closed: boolean; openPhases: ChecklistSection[]; label: string } {
  if (rollup.errors.length) return { closed: false, openPhases: [], label: 'Open · needs attention' };
  const openPhases = CHECKLIST_SECTIONS.filter((key) => !rollup.sections[key].isComplete);
  if (rollup.isComplete && openPhases.length === 0) return { closed: true, openPhases, label: 'Closed · every phase done' };
  const names = openPhases.map((key) => SECTION_TITLES[key].title);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0] ?? 'A phase';
  return { closed: false, openPhases, label: `Open · ${list} not done` };
}

/**
 * Move choices for one list of rows: the other rows there that can hold rows (the same in every view).
 * Kept here, not in the client row menu, because the server-rendered checklist workspace calls it too.
 */
export function rowMoveTargets(rows: readonly Pick<ChecklistBranchRow, 'id' | 'title' | 'linkedTaskId' | 'nodeType'>[]): { id: string | null; title: string }[] {
  return rows.filter(row => !row.linkedTaskId && row.nodeType !== 'Task').map(row => ({ id: row.id, title: row.title }));
}
