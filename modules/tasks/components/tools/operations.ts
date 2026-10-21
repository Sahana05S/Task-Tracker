import type { ToolOperation } from '@/modules/tasks/internal/tools/contract';

/**
 * The Task Tools operations offered on the Missions page (DECISIONS "Bulk
 * actions on the Missions table", 21 October 2026).
 *
 * Batch operations act on every selected mission; copy operations read one
 * source mission and need exactly one selected row. Members keep Done and
 * Refresh; everything else is for managers. The database command repeats
 * these checks (`task_tools_command`), so this list only decides what is
 * offered.
 */

export type ToolOperationKind = 'batch' | 'copy';

export interface ToolOperationSpec {
  readonly command: ToolOperation;
  /** Button and menu label. */
  readonly label: string;
  /** Drawer title. */
  readonly title: string;
  /** One sentence under the drawer title. */
  readonly summary: string;
  readonly kind: ToolOperationKind;
  readonly managerOnly: boolean;
  /** The database refuses these without a reason. */
  readonly reasonRequired: boolean;
}

type Entry = Omit<ToolOperationSpec, 'kind' | 'managerOnly' | 'reasonRequired'> &
  Partial<Pick<ToolOperationSpec, 'managerOnly' | 'reasonRequired'>>;

/** Fills the defaults: manager-only, no reason required. */
function family(kind: ToolOperationKind, entries: readonly Entry[]): readonly ToolOperationSpec[] {
  return entries.map((entry) => ({ managerOnly: true, reasonRequired: false, ...entry, kind }));
}

export const BATCH_OPERATIONS = family('batch', [
  {
    command: 'bulk_done',
    label: 'Done',
    title: 'Mark done',
    summary: 'Moves each mission to Done. Checklist and review gates still apply.',
    managerOnly: false,
  },
  {
    command: 'bulk_reopen',
    label: 'Reopen',
    title: 'Reopen',
    summary: 'Moves each mission back to In Progress.',
    reasonRequired: true,
  },
  {
    command: 'section',
    label: 'Confirm section',
    title: 'Confirm a checklist section',
    summary: 'Confirms Setup, Activity or Closure on each mission. Leaf work is kept.',
    reasonRequired: true,
  },
  {
    command: 'refresh',
    label: 'Refresh',
    title: 'Refresh metrics',
    summary: 'Recomputes freshness and shared metrics for each mission today.',
    managerOnly: false,
  },
  {
    command: 'archive',
    label: 'Archive',
    title: 'Archive',
    summary: 'Archives each mission from today. History stays readable; nothing is deleted.',
    reasonRequired: true,
  },
]);

export const COPY_OPERATIONS = family('copy', [
  {
    command: 'duplicate',
    label: 'Duplicate',
    title: 'Duplicate',
    summary: 'One new mission with the same details and checklist, execution reset.',
  },
  {
    command: 'weekly',
    label: 'Weekly phases',
    title: 'Weekly phases',
    summary: 'A run of seven-day missions starting on the assignment date.',
  },
  {
    command: 'day_count',
    label: 'Day-count phases',
    title: 'Day-count phases',
    summary: 'A run of missions, each lasting the number of days you choose.',
  },
  {
    command: 'all_team',
    label: 'One per member',
    title: 'One mission per member',
    summary: 'A copy for every active team member, each as sole assignee.',
  },
  {
    command: 'number_suffix',
    label: 'Number and suffix',
    title: 'Numbered copies',
    summary: 'Several copies numbered in order, with an optional title suffix.',
  },
  {
    command: 'support',
    label: 'Support split',
    title: 'Support split',
    summary: 'A linked support mission for another member, with a share of the scale.',
  },
  {
    command: 'carryover',
    label: 'Carryover',
    title: 'Carry over to this month',
    summary: 'Hands the remaining work to a new mission and archives this one.',
    reasonRequired: true,
  },
]);

const ALL_OPERATIONS = [...BATCH_OPERATIONS, ...COPY_OPERATIONS];

export function operationSpec(command: ToolOperation): ToolOperationSpec {
  const spec = ALL_OPERATIONS.find((operation) => operation.command === command);
  if (!spec) throw new Error(`Unknown task operation: ${command}`);
  return spec;
}

/** The operations a role is offered, in display order. */
export function operationsFor(canManage: boolean, kind: ToolOperationKind): readonly ToolOperationSpec[] {
  const list = kind === 'batch' ? BATCH_OPERATIONS : COPY_OPERATIONS;
  return canManage ? list : list.filter((operation) => !operation.managerOnly);
}

/** "1 mission", "3 missions". */
export function missionCount(count: number): string {
  return `${count} ${count === 1 ? 'mission' : 'missions'}`;
}

/** Copy operations read one source mission. */
export function canCopy(selectedCount: number): boolean {
  return selectedCount === 1;
}

/** Support splits that move scale away from the source need a reason too. */
export function reasonRequired(command: ToolOperation, splitMode?: string): boolean {
  if (command === 'support') return splitMode === 'split-even' || splitMode === 'split-uneven';
  return operationSpec(command).reasonRequired;
}
