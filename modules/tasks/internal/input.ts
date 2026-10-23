import { readNullableString, readString, UUID_PATTERN } from '@/shared/forms/form-data';
import { isTaskCategory, isTaskPriority } from '@/shared/tracker/enums';
import { readParticipantShares } from '@/modules/tasks/internal/shares';
import type { Json } from '@/types/database';
import type { TaskCategory, TaskPriority } from '@/types/tracker';

/**
 * FormData parsing for the task forms. PRIVATE.
 *
 * Pickers and number inputs are bypassable, so every value is checked here and
 * turned into a field message instead of being handed to PostgreSQL.
 */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Sentinel the reviewer picker submits for "nobody".
 *
 * Radix Select reserves the empty string to mean "no selection shown", so an
 * optional reference cannot round-trip as `''` and needs a stand-in value.
 */
const NO_SELECTION = 'none';

/** Reads a required foreign key. `null` means missing or malformed. */
function readRequiredId(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  if (value === '' || value === NO_SELECTION) return null;
  return UUID_PATTERN.test(value) ? value : null;
}

/** Reads a multi-select of ids, falling back to a single legacy field. `null` means malformed. */
function readIdList(formData: FormData, multiKey: string, legacyKey?: string): string[] | null {
  const rawValues = formData
    .getAll(multiKey)
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value !== '' && value !== NO_SELECTION);

  if (rawValues.length === 0 && legacyKey) {
    const legacyValue = readRequiredId(formData, legacyKey);
    if (legacyValue) rawValues.push(legacyValue);
  }

  const uniqueValues = [...new Set(rawValues)];
  return uniqueValues.every((value) => UUID_PATTERN.test(value)) ? uniqueValues : null;
}

/**
 * Parses a numeric field. Returns `null` for blank input and `undefined` for
 * input that is present but not a finite number, letting the caller tell
 * "cleared" apart from "invalid".
 */
function readNullableNumber(formData: FormData, key: string): number | null | undefined {
  const raw = readString(formData, key);
  if (raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** The fields shared by the create and edit task forms. */
export interface TaskFields {
  taskTag: string;
  title: string;
  category: TaskCategory;
  priority: TaskPriority;
  assigneeIds: string[];
  reviewerIds: string[];
  dueDate: string | null;
  taskScale: number | null;
  shares: number[] | null;
}

/** Reads and validates the task form, in the order the messages have always appeared. */
export function parseTaskFields(formData: FormData): Parsed<TaskFields> {
  const taskTag = readString(formData, 'taskTag');
  const title = readString(formData, 'title');
  const category = readString(formData, 'category');
  const priority = readString(formData, 'priority');
  const assigneeIds = readIdList(formData, 'assigneeIds', 'assigneeId');
  const reviewerIds = readIdList(formData, 'reviewerIds', 'reviewerId');
  const dueDate = readNullableString(formData, 'dueDate');
  const taskScale = readNullableNumber(formData, 'taskScale');
  const assigneeId = assigneeIds?.[0] ?? null;

  // A new mission may leave the tag blank: the database allocates the next
  // sheet tag (<Mon><YY>_<TYPE><n>, migration 53). An edit keeps its tag.
  if (taskTag === '' && readString(formData, 'taskId') !== '') return { ok: false, error: 'Enter a task tag.' };
  if (taskTag.length > 30) return { ok: false, error: 'Task tag must be 30 characters or fewer.' };
  if (title === '') return { ok: false, error: 'Enter a task title.' };
  if (title.length > 255) return { ok: false, error: 'Title must be 255 characters or fewer.' };
  if (!isTaskCategory(category)) return { ok: false, error: 'Select a valid category.' };
  if (!isTaskPriority(priority)) return { ok: false, error: 'Select a valid priority.' };
  if (assigneeIds === null) return { ok: false, error: 'One or more selected assignees are invalid.' };
  if (assigneeIds.length === 0 || assigneeId === null) return { ok: false, error: 'Select at least one assignee.' };
  if (reviewerIds === null) return { ok: false, error: 'One or more selected reviewers are invalid.' };
  if (taskScale === undefined) return { ok: false, error: 'Task scale must be a number.' };
  if (taskScale !== null && taskScale < 0) return { ok: false, error: 'Task scale cannot be negative.' };

  let shares: number[] | null;
  try {
    shares = readParticipantShares(formData, assigneeIds);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid shares.' };
  }

  return {
    ok: true,
    value: { taskTag, title, category, priority, assigneeIds, reviewerIds, dueDate, taskScale, shares },
  };
}

/**
 * How a new mission is weighted (New mission dialog, migration 61). `manual`
 * keeps the typed Scale weight and the plain save; the two formula modes go
 * through create_task_with_scale, which applies the same scale command the
 * Lifecycle and scale panel uses. Linked scales need a source mission and
 * stay in that panel.
 */
export type NewMissionScale =
  | { mode: 'manual' }
  | { mode: 'hours'; inputs: { multiplier: number } }
  | { mode: 'activity_count'; inputs: { activity_count: number; unit_scale: number } };

export function parseNewMissionScale(formData: FormData): Parsed<NewMissionScale> {
  const mode = readString(formData, 'scaleMode') || 'manual';
  const count = (key: string, label: string): Parsed<number> => {
    const value = readNullableNumber(formData, key);
    if (value === null) return { ok: false, error: `Enter the ${label}.` };
    if (value === undefined || value < 0) return { ok: false, error: `The ${label} must be a number of 0 or more.` };
    return { ok: true, value };
  };
  if (mode === 'manual') return { ok: true, value: { mode } };
  if (mode === 'hours') {
    const multiplier = count('scaleMultiplier', 'multiplier');
    return multiplier.ok ? { ok: true, value: { mode, inputs: { multiplier: multiplier.value } } } : multiplier;
  }
  if (mode === 'activity_count') {
    const activities = count('scaleActivityCount', 'number of activities');
    if (!activities.ok) return activities;
    if (!Number.isInteger(activities.value)) return { ok: false, error: 'The number of activities must be a whole number.' };
    const unit = count('scaleUnit', 'scale per activity');
    return unit.ok ? { ok: true, value: { mode, inputs: { activity_count: activities.value, unit_scale: unit.value } } } : unit;
  }
  return { ok: false, error: 'Choose how the mission is weighted.' };
}

/** Reads the participant version an edit was based on. `null` means the form is stale or malformed. */
export function readParticipantVersion(formData: FormData): number | null {
  const versionText = readString(formData, 'participantVersion');
  if (!/^\d+$/.test(versionText) || !Number.isSafeInteger(Number(versionText))) return null;
  return Number(versionText);
}

/** The required inputs for each scale mode. */
function requiredScaleKeys(mode: string): string[] {
  if (mode === 'manual') return ['value'];
  if (mode === 'hours') return ['multiplier'];
  if (mode === 'activity_count') return ['activityCount', 'unitScale'];
  return ['percentage'];
}

/** Returns an error message when a required scale input is blank. */
export function missingScaleInput(formData: FormData): string | null {
  const mode = readString(formData, 'mode');
  return requiredScaleKeys(mode).some((key) => readString(formData, key) === '')
    ? 'Enter the required scale inputs; blank values are unmeasured.'
    : null;
}

/** Builds the scale command payload once a linked source task id is known. */
export function buildScalePayload(formData: FormData, sourceId: string): Parsed<Json> {
  const mode = readString(formData, 'mode');
  const number = (key: string) => Number(readString(formData, key));
  const inputs =
    mode === 'manual' ? { value: number('value') }
    : mode === 'hours' ? { multiplier: number('multiplier') }
    : mode === 'activity_count' ? { activity_count: number('activityCount'), unit_scale: number('unitScale') }
    : { source_task_id: sourceId, percentage: number('percentage') };
  const rawOverride = readString(formData, 'override');

  const invalid =
    Object.values(inputs).some((v) => typeof v === 'number' && !Number.isFinite(v)) ||
    (rawOverride !== '' && !Number.isFinite(Number(rawOverride)));
  if (invalid) return { ok: false, error: 'Scale inputs must be finite numbers.' };

  return {
    ok: true,
    value: {
      mode,
      inputs,
      override: rawOverride === '' ? null : Number(rawOverride),
      reason: readString(formData, 'reason'),
      provenance: readString(formData, 'provenance'),
    },
  };
}

/** True when the lifecycle command can be sent: ids are UUIDs and the version is usable. */
export function isValidCommandTarget(taskId: string, version: number | undefined, operationId: string | undefined): boolean {
  return (
    UUID_PATTERN.test(taskId) &&
    !!operationId &&
    UUID_PATTERN.test(operationId) &&
    version !== undefined &&
    Number.isSafeInteger(version) &&
    version >= 0
  );
}
