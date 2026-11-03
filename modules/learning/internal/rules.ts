/**
 * Mistakes and learning rules (migration 111). PRIVATE; re-exported through
 * `client.ts`. The database enforces who may write and the text limits; these
 * only shape the page and its messages.
 */

export const LEARNING_KINDS = ['mistake', 'learning'] as const;
export type LearningKind = (typeof LEARNING_KINDS)[number];

export const LEARNING_KIND_LABEL: Record<LearningKind, string> = { mistake: 'Mistake', learning: 'Learning' };

/** Same bound as public.mission_learnings.body. */
export const LEARNING_MAX_LENGTH = 2000;

export interface MissionLearning {
  readonly id: string;
  readonly kind: LearningKind;
  readonly body: string;
  readonly authorName: string | null;
  readonly createdAt: string;
  readonly edited: boolean;
  readonly canEdit: boolean;
}

export interface MissionLearnings {
  /** The caller may add a note (managing director, project engineer or one of the mission's assignees; not archived). */
  readonly canAdd: boolean;
  readonly items: readonly MissionLearning[];
}

export function isLearningKind(value: unknown): value is LearningKind {
  return value === 'mistake' || value === 'learning';
}

export function learningCounts(items: readonly MissionLearning[]): Record<LearningKind, number> {
  return {
    mistake: items.filter((item) => item.kind === 'mistake').length,
    learning: items.filter((item) => item.kind === 'learning').length,
  };
}

/** Database payload of mission_learnings(task) -> the page model; anything malformed is dropped. */
export function mapLearnings(data: unknown): MissionLearnings | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const value = data as { canAdd?: unknown; items?: unknown };
  if (!Array.isArray(value.items)) return null;
  const items = (value.items as Record<string, unknown>[]).flatMap((row) => (
    row && typeof row.id === 'string' && isLearningKind(row.kind) && typeof row.body === 'string'
      ? [{
          id: row.id,
          kind: row.kind,
          body: row.body,
          authorName: typeof row.authorName === 'string' ? row.authorName : null,
          createdAt: String(row.createdAt ?? ''),
          edited: row.edited === true,
          canEdit: row.canEdit === true,
        }]
      : []
  ));
  return { canAdd: value.canAdd === true, items };
}
