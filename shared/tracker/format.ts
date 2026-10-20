/**
 * Display formatters for tracker values.
 *
 * Nulls render as an em dash rather than `0`, because the schema lets
 * `task_scale`, `progress_percentage` and `scaled_progress` be genuinely NULL
 * and "not set" is different information from "set to zero" when reading a
 * performance grid.
 */

const EM_DASH = '\u2014';

/** Fixed-decimal numeric, or an em dash when unset. */
export function formatNumeric(
  value: number | null,
  fractionDigits = 2,
): string {
  if (value === null) return EM_DASH;
  return value.toFixed(fractionDigits);
}

/**
 * Hours for display: two decimals everywhere. A non-zero value that would round
 * to 0.00 shows as "<0.01" (or ">-0.01") rather than a misleading zero. Accepts
 * exact numeric strings; display only, so stored precision is unaffected.
 */
export function formatHours(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return EM_DASH;
  const hours = Number(value);
  if (!Number.isFinite(hours)) return EM_DASH;
  const fixed = hours.toFixed(2);
  if (hours !== 0 && Number(fixed) === 0) return hours > 0 ? '<0.01' : '>-0.01';
  return fixed;
}

/** Percentage with a trailing sign, or an em dash when unset. */
export function formatPercent(value: number | null): string {
  if (value === null) return EM_DASH;
  return `${value.toFixed(0)}%`;
}

/**
 * Clamps a possibly-null percentage into the 0-100 range for progress bars.
 * Null and out-of-range values collapse to a drawable number.
 */
export function toProgressValue(value: number | null): number {
  if (value === null || Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * Renders an ISO date (`YYYY-MM-DD`) as a short, locale-independent label.
 *
 * Parsed as UTC deliberately: `new Date('2026-09-30')` is already UTC midnight,
 * and reading it back with local getters would shift the day backwards for
 * anyone west of Greenwich.
 */
export function formatDate(value: string | null): string {
  if (!value) return EM_DASH;

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return EM_DASH;

  const day = parsed.getUTCDate().toString().padStart(2, '0');
  const month = parsed.toLocaleString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });

  return `${day} ${month} ${parsed.getUTCFullYear()}`;
}

/**
 * A timestamp as a medium date and short time in Asia/Kolkata, the business
 * timezone, so server and browser render the same moment the same way.
 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return EM_DASH;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return EM_DASH;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(parsed);
}

/** `true` when the date is strictly before today, for overdue highlighting. */
export function isOverdue(dueDate: string | null, today = new Date()): boolean {
  if (!dueDate) return false;

  const due = new Date(`${dueDate}T00:00:00Z`);
  if (Number.isNaN(due.getTime())) return false;

  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );

  return due.getTime() < todayUtc;
}
