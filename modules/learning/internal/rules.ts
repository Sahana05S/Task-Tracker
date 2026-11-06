/**
 * Quest notes (migration 132). PRIVATE; re-exported through `client.ts`. A note is a short text on
 * one Quest with one or more ordinary labels. The database decides who may write, edit and delete and
 * checks the limits; these only shape the panel.
 */

import { mapLabel, type Label } from '@/modules/labels/client';

/** Same bound as public.mission_learnings.body. */
export const NOTE_MAX_LENGTH = 2000;

export interface QuestNote {
  readonly id: string;
  readonly body: string;
  readonly authorName: string | null;
  readonly createdAt: string;
  readonly edited: boolean;
  /** The author, while the mission is open. */
  readonly canEdit: boolean;
  /** The author, a Manager or the managing director, while the mission is open. */
  readonly canDelete: boolean;
  readonly labels: readonly Label[];
}

export interface QuestNotes {
  readonly questTitle: string;
  /** The caller may add a note (the mission's Crew, Managers and the managing director; not archived). */
  readonly canAdd: boolean;
  /** Newest first. */
  readonly items: readonly QuestNote[];
}

/** Notes carrying the label `slug` (all when null). */
export function filterNotes(items: readonly QuestNote[], slug: string | null): QuestNote[] {
  return slug ? items.filter((note) => note.labels.some((label) => label.slug === slug)) : [...items];
}

/** quest_notes(node) -> the panel model; anything malformed is dropped. */
export function mapQuestNotes(data: unknown): QuestNotes | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const value = data as { canAdd?: unknown; items?: unknown; questTitle?: unknown };
  if (!Array.isArray(value.items)) return null;
  const items = (value.items as (Record<string, unknown> | null)[]).flatMap((row): QuestNote[] => (
    row && typeof row.id === 'string' && typeof row.body === 'string'
      ? [{
          id: row.id,
          body: row.body,
          authorName: typeof row.authorName === 'string' ? row.authorName : null,
          createdAt: String(row.createdAt ?? ''),
          edited: row.edited === true,
          canEdit: row.canEdit === true,
          canDelete: row.canDelete === true,
          labels: Array.isArray(row.labels) ? row.labels.flatMap((label) => { const mapped = mapLabel(label); return mapped ? [mapped] : []; }) : [],
        }]
      : []
  ));
  return { questTitle: typeof value.questTitle === 'string' ? value.questTitle : 'this Quest', canAdd: value.canAdd === true, items };
}

/** quest_note_counts(task) -> {Quest row id: notes}; only positive whole numbers. */
export function mapNoteCounts(data: unknown): Record<string, number> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return Object.fromEntries(Object.entries(data as Record<string, unknown>)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isInteger(entry[1]) && entry[1] > 0));
}
