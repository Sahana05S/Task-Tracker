import type { Json } from '@/types/database';

/** FormData parsing for checklist commands. PRIVATE. */

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const read = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

/** The form fields each checklist command sends to `checklist_command`. */
const COMMAND_FIELDS: Record<string, string[]> = {
  create: ['title'],
  add: ['title', 'description', 'section', 'parent_id'],
  state: ['node_id', 'state'],
  edit: ['node_id', 'title', 'section', 'parent_id', 'linked_task_id', 'node_type', 'reason'],
  map: ['node_id', 'section', 'reason'],
  delete: ['node_id', 'reason'],
  duplicate: ['node_id'],
  mode: ['enabled', 'reason', 'preview_progress'],
};

/** Converts one field to its payload value: booleans, an optional preview, or text/null. */
function fieldValue(key: string, value: string): Json {
  if (key === 'enabled') return value === 'true';
  if (key === 'preview_progress') return value || null;
  return value || null;
}

export interface ChecklistCommandInput {
  taskId: string;
  command: string;
  payload: Record<string, Json>;
  expectedVersion: number;
  operationId: string;
}

/** Reads and validates a checklist command form, in the order the messages have always appeared. */
export function parseChecklistCommand(form: FormData): Parsed<ChecklistCommandInput> {
  const command = read(form, 'command');
  const fields = COMMAND_FIELDS[command];
  if (!fields) return { ok: false, error: 'Unknown checklist action.' };

  const payload: Record<string, Json> = {};
  for (const key of fields) payload[key] = fieldValue(key, read(form, key));

  // Optional row details (migration 33): sent only when the form has the field, so
  // an edit without them keeps the stored links and estimate.
  if (form.has('checklist_id')) payload.checklist_id = fieldValue('checklist_id', read(form, 'checklist_id'));
  const editsRow = command === 'add' || command === 'edit';
  if (editsRow && form.has('priority')) {
    const priority = read(form, 'priority');
    if (!/^[0-3]$/.test(priority)) return { ok: false, error: 'Choose a priority from 0 to 3.' };
    payload.priority = Number(priority);
  }
  if (editsRow && form.has('links')) payload.links = read(form, 'links').split(/\s+/).filter(Boolean);
  if (editsRow && form.has('estimated_minutes')) {
    const minutes = read(form, 'estimated_minutes');
    if (minutes && !/^\d+$/.test(minutes)) return { ok: false, error: 'Estimated time must be whole minutes.' };
    payload.estimated_minutes = minutes ? Number(minutes) : null;
  }

  const version = read(form, 'expectedVersion');
  if (!/^\d+$/.test(version)) return { ok: false, error: 'Reload the checklist before saving.' };

  return {
    ok: true,
    value: {
      taskId: read(form, 'taskId'),
      command,
      payload,
      expectedVersion: Number(version),
      operationId: read(form, 'operationId'),
    },
  };
}
