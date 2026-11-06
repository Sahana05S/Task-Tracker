/**
 * Notes rules (migration 111, Notes since migration 126). PRIVATE; re-exported
 * through `client.ts`. A note is a short text with hashtags (workspace labels),
 * at least one of them a note type (#mistake, #learning, ...). The database
 * enforces who may write, the type rule and the text limits; these only shape
 * the page and its messages.
 */

import { mapLabel, type Label } from '@/modules/labels/client';

/** Same bound as public.mission_learnings.body. */
export const NOTE_MAX_LENGTH = 2000;
/** Same bound as mission_note_command. */
export const NOTE_MAX_HASHTAGS = 20;

export type NoteNodeKind = 'quest' | 'objective';

export interface MissionNote {
  readonly id: string;
  readonly body: string;
  readonly authorName: string | null;
  readonly createdAt: string;
  readonly edited: boolean;
  /** The author, while the mission is open. */
  readonly canEdit: boolean;
  /** The author or a manager, while the mission is open. */
  readonly canDelete: boolean;
  /** The Quest or objective the note was written on; null for the mission itself. */
  readonly nodeId: string | null;
  readonly nodeTitle: string | null;
  readonly nodeKind: NoteNodeKind | null;
  /** Type hashtags first. */
  readonly labels: readonly Label[];
}

export interface MissionNotes {
  /** The caller may add a note (the mission's Crew, Managers on it, the managing director; not archived). */
  readonly canAdd: boolean;
  readonly items: readonly MissionNote[];
}

/** The note-type hashtags of a catalogue (not archived). */
export function noteTypeLabels(catalogue: readonly Label[]): Label[] {
  return catalogue.filter((label) => label.noteType && !label.archived);
}

export const hasNoteType = (labels: readonly Label[]): boolean => labels.some((label) => label.noteType);

/** Notes carrying the hashtag `slug` (all when null), optionally only those on one Quest or objective. */
export function filterNotes(items: readonly MissionNote[], slug: string | null, nodeId: string | null = null): MissionNote[] {
  return items.filter((note) => (!slug || note.labels.some((label) => label.slug === slug)) && (!nodeId || note.nodeId === nodeId));
}

/** Each hashtag used on the notes, with its count, most used first (the panel's filter chips). */
export function noteHashtagCounts(items: readonly MissionNote[]): { label: Label; count: number }[] {
  const counts = new Map<string, { label: Label; count: number }>();
  for (const note of items) {
    for (const label of note.labels) {
      const entry = counts.get(label.id) ?? { label, count: 0 };
      entry.count++;
      counts.set(label.id, entry);
    }
  }
  return [...counts.values()].sort((a, b) => Number(b.label.noteType) - Number(a.label.noteType) || b.count - a.count || a.label.name.localeCompare(b.label.name));
}

/** "#mistake #client": the words an activity line uses. */
export const hashtagLine = (labels: readonly Label[]): string => labels.map((label) => `#${label.name}`).join(' ');

const NODE_KINDS: readonly unknown[] = ['quest', 'objective'];

/** Database payload of mission_notes(task) -> the page model; anything malformed is dropped. */
export function mapNotes(data: unknown): MissionNotes | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const value = data as { canAdd?: unknown; items?: unknown };
  if (!Array.isArray(value.items)) return null;
  const items = (value.items as (Record<string, unknown> | null)[]).flatMap((row): MissionNote[] => (
    row && typeof row.id === 'string' && typeof row.body === 'string'
      ? [{
          id: row.id,
          body: row.body,
          authorName: typeof row.authorName === 'string' ? row.authorName : null,
          createdAt: String(row.createdAt ?? ''),
          edited: row.edited === true,
          canEdit: row.canEdit === true,
          canDelete: row.canDelete === true,
          nodeId: typeof row.nodeId === 'string' ? row.nodeId : null,
          nodeTitle: typeof row.nodeTitle === 'string' ? row.nodeTitle : null,
          nodeKind: NODE_KINDS.includes(row.nodeKind) ? row.nodeKind as NoteNodeKind : null,
          labels: Array.isArray(row.labels) ? row.labels.flatMap((label) => { const mapped = mapLabel(label); return mapped ? [mapped] : []; }) : [],
        }]
      : []
  ));
  return { canAdd: value.canAdd === true, items };
}

/** mission_note_hashtags(tasks): {mission id: hashtag slugs on its notes}. */
export function mapNoteHashtags(data: unknown): Record<string, string[]> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return Object.fromEntries(Object.entries(data as Record<string, unknown>).map(([id, slugs]) => [
    id, Array.isArray(slugs) ? slugs.filter((slug): slug is string => typeof slug === 'string') : [],
  ]));
}
