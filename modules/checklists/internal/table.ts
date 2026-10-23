import type { ChecklistBranchRow } from './branch-types';
import type { ChecklistNodeProgress, ChecklistSection, CompletionState, SectionProgress } from './progress';

/**
 * Pure rules for the checklist tables (the sheet's Checklist Home and "[ChL]"
 * tabs). Server-safe and client-safe; no data access.
 */

export type ChecklistRowKind = 'item' | 'parent' | 'linked' | 'quest';

export const SECTION_TITLES: Record<ChecklistSection, { title: string; note: string }> = {
  setup: { title: 'Setup', note: 'Completion gate: done before the work starts' },
  activity: { title: 'Activity', note: 'Drives mission progress' },
  closure: { title: 'Closure', note: 'Completion gate: done before the mission closes' },
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

/** Completion choices a row offers; rows with rows under them offer none. */
export function stateChoices(kind: ChecklistRowKind): readonly CompletionState[] {
  if (kind === 'item') return ['Yes', 'No', 'N/A'];
  // Completion follows the linked mission; the row can only be excluded or restored.
  if (kind === 'linked') return ['No', 'N/A'];
  return [];
}

/** OPEN / CLOSED / N/A for a page, as on the sheet's "[ChL]" tabs. */
export function pageResult(progress: Pick<ChecklistNodeProgress, 'applicable' | 'isComplete'> | null | undefined): 'OPEN' | 'CLOSED' | 'N/A' {
  if (progress?.applicable === false) return 'N/A';
  return progress?.isComplete ? 'CLOSED' : 'OPEN';
}

/** Short state for a section header. */
export function sectionStatus(section: SectionProgress): { label: string; tone: 'done' | 'active' | 'idle' | 'alert' } {
  switch (section.state) {
    case 'complete': return { label: 'Gate satisfied', tone: 'done' };
    case 'not_applicable': return { label: 'No rows (N/A)', tone: 'done' };
    case 'partial': return { label: 'In progress', tone: 'active' };
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
