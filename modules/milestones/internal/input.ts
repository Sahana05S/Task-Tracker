import {
  ISO_DATE_PATTERN,
  readNullableString,
  readString,
  UUID_PATTERN,
} from '@/shared/forms/form-data';
import { isMilestoneStatus } from '@/shared/tracker/enums';
import type { MilestoneStatus } from '@/types/tracker';

/**
 * FormData parsing for the statement and milestone forms. PRIVATE.
 *
 * `<input type="date">`, number inputs and the owner picker are all bypassable,
 * so every value is checked here and turned into a field message rather than
 * handed to PostgreSQL, which would reject the whole write with a type error.
 */

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Sentinel the owner picker submits for "nobody in particular". */
const NO_OWNER = 'none';

const MAX_STATEMENT_TITLE = 80;
const MAX_MILESTONE_TITLE = 120;

/** Reads a required UUID. `null` means missing or malformed. */
export function readId(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return UUID_PATTERN.test(value) ? value : null;
}

export function isMilestoneId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Reads the optional owner reference.
 *
 * `null` for blank input and for the picker's sentinel; `undefined` for anything
 * that is not a UUID, which lets the caller reject malformed input rather than
 * handing PostgreSQL a value it will only fail on.
 */
function readOwnerId(formData: FormData): string | null | undefined {
  const value = readString(formData, 'ownerId');
  if (value === '' || value === NO_OWNER) return null;
  return UUID_PATTERN.test(value) ? value : undefined;
}

/**
 * Parses a whole-number count. Returns `null` for blank input and `undefined`
 * for input that is present but not a non-negative integer, so "cleared" and
 * "invalid" stay distinguishable.
 */
function readCount(formData: FormData, key: string): number | null | undefined {
  const raw = readString(formData, key);
  if (raw === '') return null;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) return undefined;
  return parsed;
}

/**
 * Reads an optional `YYYY-MM-DD` date, which is how DATE columns round-trip
 * through PostgREST. `undefined` signals a malformed value.
 */
function readDueDate(formData: FormData): string | null | undefined {
  const raw = readString(formData, 'dueDate');
  if (raw === '') return null;
  if (!ISO_DATE_PATTERN.test(raw)) return undefined;

  // Catches 2026-02-30, which matches the pattern but is not a real date.
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10) === raw ? raw : undefined;
}

/* -------------------------------------------------------------------------- */
/* Statements                                                                 */
/* -------------------------------------------------------------------------- */

export interface StatementFields {
  statementId: string;
  title: string;
  statement: string;
  subtext: string | null;
}

/**
 * Validates the statement editor. `key_name` is deliberately not read: it is the
 * handle the showcase selects by, so letting a form change it would let an edit
 * make the card disappear.
 */
export function parseStatementInput(formData: FormData): Parsed<StatementFields> {
  const statementId = readId(formData, 'statementId');
  if (statementId === null) {
    return { ok: false, error: 'Missing statement reference.' };
  }

  const title = readString(formData, 'title');
  const statement = readString(formData, 'statement');
  const subtext = readNullableString(formData, 'subtext');

  if (title === '') return { ok: false, error: 'Enter a heading.' };
  if (title.length > MAX_STATEMENT_TITLE) {
    return {
      ok: false,
      error: `Heading must be ${MAX_STATEMENT_TITLE} characters or fewer.`,
    };
  }
  if (statement === '') {
    return { ok: false, error: 'Enter the statement text.' };
  }

  return { ok: true, value: { statementId, title, statement, subtext } };
}

/* -------------------------------------------------------------------------- */
/* Milestones                                                                 */
/* -------------------------------------------------------------------------- */

/** Column payload for `company_milestones`. */
export interface MilestoneFields {
  title: string;
  description: string | null;
  status: MilestoneStatus;
  owner_id: string | null;
  delivered_count: number;
  target_count: number | null;
  due_date: string | null;
}

/**
 * Validates the shared milestone form fields.
 *
 * Create and edit accept exactly the same shape, so the rules live once. Returns
 * either the column payload or the first message worth showing.
 */
export function parseMilestoneInput(formData: FormData): Parsed<MilestoneFields> {
  const title = readString(formData, 'title');
  const description = readNullableString(formData, 'description');
  const status = readString(formData, 'status');
  const ownerId = readOwnerId(formData);
  const deliveredCount = readCount(formData, 'deliveredCount');
  const targetCount = readCount(formData, 'targetCount');
  const dueDate = readDueDate(formData);

  if (title === '') return { ok: false, error: 'Enter a milestone title.' };
  if (title.length > MAX_MILESTONE_TITLE) {
    return {
      ok: false,
      error: `Title must be ${MAX_MILESTONE_TITLE} characters or fewer.`,
    };
  }
  if (!isMilestoneStatus(status)) {
    return { ok: false, error: 'Select a valid status.' };
  }
  if (ownerId === undefined) {
    return { ok: false, error: 'The selected owner is not valid.' };
  }
  if (deliveredCount === undefined) {
    return { ok: false, error: 'Delivered must be a whole number, zero or more.' };
  }
  if (targetCount === undefined) {
    return { ok: false, error: 'Target must be a whole number, zero or more.' };
  }
  // The column CHECK rejects zero. Catch it here so the message names the field
  // instead of arriving as a constraint violation.
  if (targetCount !== null && targetCount < 1) {
    return {
      ok: false,
      error: 'Target must be at least 1, or left blank for an uncountable goal.',
    };
  }
  if (dueDate === undefined) {
    return { ok: false, error: 'Enter a valid due date, or leave it blank.' };
  }

  return {
    ok: true,
    value: {
      title,
      description,
      status,
      owner_id: ownerId,
      // NOT NULL with a default of 0; a cleared field means none delivered.
      delivered_count: deliveredCount ?? 0,
      target_count: targetCount,
      due_date: dueDate,
    },
  };
}
