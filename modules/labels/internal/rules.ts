/**
 * Workspace label rules (migration 112; note types since 126). PRIVATE; re-exported through
 * `client.ts`. "Label" is the word in code and copy; "tag" is the mission
 * identifier (tasks.task_tag). `#` is only how a label is typed. The database
 * enforces every rule; these shape the page.
 */

export const LABEL_SUBJECT_KINDS = ['task', 'mission_learning', 'meeting_point'] as const;
export type LabelSubjectKind = (typeof LABEL_SUBJECT_KINDS)[number];

/** Theme colour tokens a label may use (labels.colour_token); never a literal colour. */
export const LABEL_COLOURS = ['neutral', 'primary', 'success', 'attention', 'danger', 'recognition'] as const;
export type LabelColour = (typeof LABEL_COLOURS)[number];

export const LABEL_COLOUR_NAME: Record<LabelColour, string> = {
  neutral: 'Grey', primary: 'Blue', success: 'Green', attention: 'Amber', danger: 'Red', recognition: 'Gold',
};

/** Chip classes per token, all from app/globals.css. */
export const LABEL_COLOUR_CLASS: Record<LabelColour, string> = {
  neutral: 'badge-neutral',
  primary: 'bg-primary-subtle text-primary-subtle-foreground',
  success: 'bg-success-subtle text-success-strong',
  attention: 'bg-attention-subtle text-attention-foreground',
  danger: 'bg-danger-subtle text-danger-foreground',
  recognition: 'bg-recognition-subtle text-recognition-foreground',
};

export const LABEL_NAME_MAX = 40;

export interface Label {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly colour: LabelColour;
  readonly description: string | null;
  readonly archived: boolean;
  /** A note type (migration 126): every note carries at least one. Managers choose them in Settings > Company. */
  readonly noteType: boolean;
}

export interface CatalogueLabel extends Label { readonly uses: number }
export interface LabelCatalogue { readonly canManage: boolean; readonly labels: readonly CatalogueLabel[] }

export interface LabelledItem {
  readonly kind: LabelSubjectKind;
  readonly id: string;
  readonly title: string;
  readonly taskTag: string | null;
  readonly date: string | null;
  readonly status: string | null;
  /** Notes (migration 126): the note's mission and the Quest or objective it was written on. */
  readonly taskId: string | null;
  readonly nodeId: string | null;
  readonly nodeTitle: string | null;
  /** Quest notes (migration 132): the list the Quest's row sits in, and whether it is the mission's own. */
  readonly listId: string | null;
  readonly rootList: boolean;
}
export interface LabelledRecords { readonly label: Label; readonly items: readonly LabelledItem[] }

const isColour = (value: unknown): value is LabelColour => (LABEL_COLOURS as readonly unknown[]).includes(value);
export const isLabelSubjectKind = (value: unknown): value is LabelSubjectKind => (LABEL_SUBJECT_KINDS as readonly unknown[]).includes(value);

/** The slug the database derives from a name (taskpulse_private.label_slug), for links and duplicate hints. */
export function labelSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, LABEL_NAME_MAX).replace(/^-+|-+$/g, '');
}

/** What was typed after `#`, tidied the way the database stores a name. */
export function cleanLabelName(typed: string): string {
  return typed.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim();
}

/** Catalogue labels (not archived, not already on the record) whose name or slug starts with or contains the query. */
export function labelSuggestions(catalogue: readonly Label[], query: string, current: readonly Label[], limit = 8): Label[] {
  const taken = new Set(current.map((label) => label.id));
  const wanted = labelSlug(cleanLabelName(query));
  const open = catalogue.filter((label) => !label.archived && !taken.has(label.id));
  if (!wanted) return open.slice(0, limit);
  const starts = open.filter((label) => label.slug.startsWith(wanted));
  const contains = open.filter((label) => !label.slug.startsWith(wanted) && label.slug.includes(wanted));
  return [...starts, ...contains].slice(0, limit);
}

export function mapLabel(row: unknown): Label | null {
  if (!row || typeof row !== 'object') return null;
  const value = row as Record<string, unknown>;
  if (typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.slug !== 'string') return null;
  return {
    id: value.id,
    name: value.name,
    slug: value.slug,
    colour: isColour(value.colour) ? value.colour : 'neutral',
    description: typeof value.description === 'string' ? value.description : null,
    archived: value.archived === true,
    noteType: value.noteType === true,
  };
}

export function mapCatalogue(data: unknown): LabelCatalogue | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const value = data as { canManage?: unknown; labels?: unknown };
  if (!Array.isArray(value.labels)) return null;
  return {
    canManage: value.canManage === true,
    labels: value.labels.flatMap((row) => {
      const label = mapLabel(row);
      return label ? [{ ...label, uses: Number((row as { uses?: unknown }).uses ?? 0) || 0 }] : [];
    }),
  };
}

/** labels_for(kind, ids): {subject id: labels}. */
export function mapLabelsFor(data: unknown): Record<string, Label[]> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return Object.fromEntries(Object.entries(data as Record<string, unknown>).map(([id, rows]) => [
    id, Array.isArray(rows) ? rows.flatMap((row) => { const label = mapLabel(row); return label ? [label] : []; }) : [],
  ]));
}

export function mapLabelled(data: unknown): LabelledRecords | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as { label?: unknown; items?: unknown };
  const label = mapLabel(value.label);
  if (!label || !Array.isArray(value.items)) return null;
  const items = value.items.flatMap((row): LabelledItem[] => {
    const item = row as Record<string, unknown> | null;
    if (!item || !isLabelSubjectKind(item.kind) || typeof item.id !== 'string') return [];
    return [{
      kind: item.kind,
      id: item.id,
      title: String(item.title ?? ''),
      taskTag: typeof item.taskTag === 'string' ? item.taskTag : null,
      date: typeof item.date === 'string' ? item.date : null,
      status: typeof item.status === 'string' ? item.status : null,
      taskId: typeof item.taskId === 'string' ? item.taskId : null,
      nodeId: typeof item.nodeId === 'string' ? item.nodeId : null,
      nodeTitle: typeof item.nodeTitle === 'string' ? item.nodeTitle : null,
      listId: typeof item.listId === 'string' ? item.listId : null,
      rootList: item.rootList !== false,
    }];
  });
  return { label, items };
}

/** Notes on a label page (migration 132), grouped by mission and then Quest, in the order they arrive (newest first). */
export interface LabelledNoteGroup {
  readonly taskTag: string;
  readonly quests: readonly { readonly nodeId: string | null; readonly nodeTitle: string | null; readonly listId: string | null; readonly rootList: boolean; readonly notes: readonly LabelledItem[] }[];
}
export function labelledNoteGroups(items: readonly LabelledItem[]): LabelledNoteGroup[] {
  const missions = new Map<string, Map<string, { nodeId: string | null; nodeTitle: string | null; listId: string | null; rootList: boolean; notes: LabelledItem[] }>>();
  for (const item of items) {
    if (item.kind !== 'mission_learning' || !item.taskTag) continue;
    const quests = missions.get(item.taskTag) ?? new Map();
    missions.set(item.taskTag, quests);
    const key = item.nodeId ?? '';
    const quest = quests.get(key) ?? { nodeId: item.nodeId, nodeTitle: item.nodeTitle, listId: item.listId, rootList: item.rootList, notes: [] };
    quest.notes.push(item);
    quests.set(key, quest);
  }
  return [...missions].map(([taskTag, quests]) => ({ taskTag, quests: [...quests.values()] }));
}
