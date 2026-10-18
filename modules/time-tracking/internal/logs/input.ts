import {
  ISO_DATE_PATTERN,
  readNullableString,
  readString,
  UUID_PATTERN,
} from '@/shared/forms/form-data';

/** FormData parsing for the work-log forms. PRIVATE. */

const MAX_HOURS_PER_ENTRY = 24;
const MAX_RAW_LINKS = 10;
const FUTURE_DATE_GRACE_DAYS = 1;

/** A UUID field, or null when missing or malformed. */
export function readId(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return UUID_PATTERN.test(value) ? value : null;
}

/** `undefined` signals present-but-unparseable, distinct from blank. */
function readNumber(formData: FormData, key: string): number | null | undefined {
  const raw = readString(formData, key);
  if (raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isWithinFutureGrace(isoDate: string): boolean {
  const limit = new Date();
  limit.setUTCDate(limit.getUTCDate() + FUTURE_DATE_GRACE_DAYS);
  return isoDate <= limit.toISOString().slice(0, 10);
}

/**
 * Collects the repeated `rawLinks` fields into a clean array.
 *
 * Only http and https survive. Rejecting other schemes here matters because
 * these values are rendered as anchors in the history view, and `javascript:`
 * in an href is a stored cross-site-scripting vector.
 */
function readRawLinks(formData: FormData): string[] | null | undefined {
  const values = formData
    .getAll('rawLinks')
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');

  if (values.length === 0) return null;
  if (values.length > MAX_RAW_LINKS) return undefined;

  for (const value of values) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return undefined;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
  }

  return values;
}

export interface LogInput {
  taskId: string;
  logDate: string;
  hoursWorked: number;
  progressDelta: number;
  updateNotes: string | null;
  rawLinks: string[] | null;
}

/** Reads and validates a log entry form. */
export function parseLogInput(formData: FormData): { ok: true; input: LogInput } | { ok: false; error: string } {
  const taskId = readId(formData, 'taskId');
  if (taskId === null) return { ok: false, error: 'Select a task to log against.' };

  const logDate = readString(formData, 'logDate');
  if (!ISO_DATE_PATTERN.test(logDate)) return { ok: false, error: 'Enter a valid log date.' };
  if (!isWithinFutureGrace(logDate)) return { ok: false, error: 'Log date cannot be in the future.' };

  const hoursWorked = readNumber(formData, 'hoursWorked');
  if (hoursWorked === undefined) return { ok: false, error: 'Hours worked must be a number.' };
  if (hoursWorked === null) return { ok: false, error: 'Enter the hours worked.' };
  if (hoursWorked < 0) return { ok: false, error: 'Hours worked cannot be negative.' };
  if (hoursWorked > MAX_HOURS_PER_ENTRY) {
    return { ok: false, error: `A single entry cannot exceed ${MAX_HOURS_PER_ENTRY} hours.` };
  }

  const progressDeltaRaw = readNumber(formData, 'progressDelta');
  if (progressDeltaRaw === undefined) return { ok: false, error: 'Progress added must be a number.' };
  const progressDelta = progressDeltaRaw ?? 0;
  if (progressDelta < -100 || progressDelta > 100) {
    return { ok: false, error: 'Progress added must be between -100 and 100.' };
  }

  const rawLinks = readRawLinks(formData);
  if (rawLinks === undefined) {
    return { ok: false, error: `Links must be valid http or https URLs, up to ${MAX_RAW_LINKS} of them.` };
  }

  return {
    ok: true,
    input: {
      taskId,
      logDate,
      hoursWorked,
      progressDelta,
      updateNotes: readNullableString(formData, 'updateNotes'),
      rawLinks,
    },
  };
}

/** The payload shape `create_task_log` and `correct_task_log` expect. */
export function logPayload(input: LogInput, reason: string | null) {
  return {
    log_date: input.logDate,
    hours_worked: input.hoursWorked,
    requested_delta: input.progressDelta,
    notes: input.updateNotes,
    raw_links: input.rawLinks,
    reason,
  };
}
