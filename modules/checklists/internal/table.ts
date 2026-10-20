import type { ChecklistBranchRow } from './branch-types';
import type { ChecklistNodeProgress, ChecklistSection, CompletionState, SectionProgress } from './progress';

/**
 * Pure rules for the checklist tables (the sheet's Checklist Home and "[ChL]"
 * tabs). Server-safe and client-safe; no data access.
 */

export type ChecklistRowKind = 'item' | 'page' | 'submission' | 'linked' | 'parent-item';

export const SECTION_TITLES: Record<ChecklistSection, { title: string; note: string }> = {
  setup: { title: 'Setup', note: 'Completion gate: done before the work starts' },
  activity: { title: 'Activity', note: 'Drives mission progress' },
  closure: { title: 'Closure', note: 'Completion gate: done before the mission closes' },
};

export const ROW_KIND_LABELS: Record<ChecklistRowKind, string> = {
  item: 'Item',
  page: 'Page',
  submission: 'Sub-mission',
  linked: 'Linked',
  'parent-item': 'Item',
};

/**
 * How a row behaves. Pages, Groups and Sub-missions open their own table; a
 * row linked to a real mission follows that mission; an Item that already has
 * sub-items (legacy structure) rolls up from them and has no state of its own.
 */
export function rowKind(row: Pick<ChecklistBranchRow, 'isSubMission' | 'nodeType' | 'linkedTaskId' | 'childCount'>): ChecklistRowKind {
  if (row.isSubMission) return 'submission';
  if (row.nodeType === 'Page' || row.nodeType === 'Group') return 'page';
  if (row.linkedTaskId || row.nodeType === 'Task') return 'linked';
  if (row.childCount > 0) return 'parent-item';
  return 'item';
}

/** Rows that open a nested table through the bounded branch read. */
export const opensTable = (kind: ChecklistRowKind) => kind === 'page' || kind === 'submission';

/** Completion choices a row offers; containers offer none. */
export function stateChoices(kind: ChecklistRowKind): readonly CompletionState[] {
  if (kind === 'item') return ['Yes', 'No', 'N/A'];
  // Completion follows the linked mission; the row can only be excluded or restored.
  if (kind === 'linked') return ['No', 'N/A'];
  return [];
}

/**
 * Templates and native initialisation create one root Page/Group per section
 * named after it ("Setup", "Activity", "Closure"). That page is the section
 * itself, so the home table lists its rows directly.
 */
export function isSectionRoot(row: Pick<ChecklistBranchRow, 'parentNodeId' | 'nodeType' | 'title' | 'isSubMission'>, section: ChecklistSection): boolean {
  return !row.parentNodeId && !row.isSubMission && (row.nodeType === 'Page' || row.nodeType === 'Group')
    && row.title.trim().toLowerCase() === section;
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
    case 'not_applicable': return section.isComplete ? { label: 'Confirmed empty', tone: 'done' } : { label: 'No applicable items', tone: 'idle' };
    case 'partial': return { label: 'In progress', tone: 'active' };
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
  missing_parent: 'A row points to a page that no longer exists.',
  cross_section: 'A row sits under a page in a different section.',
  cycle: 'Two pages contain each other.',
  linked_unavailable: 'A row linked to a mission cannot read that mission’s progress.',
  linked_parent: 'A row linked to a mission also has rows inside it.',
  linked_done_mismatch: 'A linked mission is Done but not at 100%.',
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
