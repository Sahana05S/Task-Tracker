'use server';

import { revalidatePath } from 'next/cache';
import type { PostgrestError } from '@supabase/supabase-js';

import { getCurrentProfile } from '@/lib/auth/profile';
import { createClient } from '@/lib/supabase/server';
import { canManageMilestones, isMilestoneStatus } from '@/lib/tracker/enums';
import type { ActionResponse, MilestoneStatus, User } from '@/types/tracker';

/**
 * Server Actions for the organisational statements and milestones.
 *
 * Authorisation is enforced twice, as everywhere else in this app. The role check
 * below runs first so the form can show a sentence a person can act on; the
 * `Leadership can manage …` policies from `04_milestones_and_vision.sql` run last
 * and are the real boundary. If this file were bypassed entirely, PostgreSQL would
 * still refuse the write.
 *
 * Both tables are readable by every authenticated member and writable only by
 * `managing_director` and `project_engineer`.
 */

export type StatementActionState = ActionResponse<{
  statementId: string;
  title: string;
}>;

export type MilestoneActionState = ActionResponse<{ milestoneId: string }>;

/* -------------------------------------------------------------------------- */
/* Actor resolution                                                           */
/* -------------------------------------------------------------------------- */

type Actor =
  | { readonly ok: true; readonly profile: User }
  | { readonly ok: false; readonly error: string };

/** Resolves the caller and confirms they may edit organisational content. */
async function resolveEditor(): Promise<Actor> {
  const profile = await getCurrentProfile();

  if (!profile) {
    return { ok: false, error: 'You are not signed in.' };
  }
  if (!profile.isActive) {
    return { ok: false, error: 'Your account is deactivated.' };
  }
  if (!canManageMilestones(profile.role)) {
    return {
      ok: false,
      error:
        'Only managing directors and project engineers can edit vision and milestones.',
    };
  }

  return { ok: true, profile };
}

/* -------------------------------------------------------------------------- */
/* Input handling                                                             */
/* -------------------------------------------------------------------------- */

/** Sentinel the owner picker submits for "nobody in particular". */
const NO_OWNER = 'none';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_STATEMENT_TITLE = 80;
const MAX_MILESTONE_TITLE = 120;

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

/** Empty strings become `null`, matching the nullable columns. */
function readNullableString(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return value === '' ? null : value;
}

/** Reads a required UUID. `null` means missing or malformed. */
function readId(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return UUID_PATTERN.test(value) ? value : null;
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

/** `YYYY-MM-DD`, which is how DATE columns round-trip through PostgREST. */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads an optional date. `undefined` signals a malformed value, which matters
 * because `<input type="date">` is bypassable and PostgreSQL would otherwise
 * reject the whole write with a type error rather than a field message.
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
/* Error translation                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Turns a PostgREST error into something a user can act on.
 *
 * `42501` is the one that matters: it is what RLS returns when a policy refuses
 * the write, and it is the signal that the role check above was circumvented or
 * has drifted out of step with the policies.
 */
function describeDatabaseError(error: PostgrestError): string {
  switch (error.code) {
    case '23505':
      return 'That statement key is already in use.';
    case '23503':
      return 'The selected owner no longer exists.';
    case '23514':
      return 'A count is outside its permitted range.';
    case '42501':
      return 'You do not have permission to perform that change.';
    // PGRST205 is PostgREST's schema-cache miss, 42P01 PostgreSQL's own
    // undefined_table. Either means migration 04 has not been applied.
    case 'PGRST205':
    case '42P01':
      return 'The milestones tables are missing. Apply supabase/migrations/04_milestones_and_vision.sql.';
    default:
      return error.message;
  }
}

/** Both views read from these tables, and the drawer badge counts milestones. */
function revalidateMilestones(): void {
  revalidatePath('/milestones');
  // The open-milestone badge is rendered by the workspace layout.
  revalidatePath('/', 'layout');
}

/* -------------------------------------------------------------------------- */
/* Statements                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Rewrites one statement block: vision, mission or core values.
 *
 * `key_name` is deliberately not editable. It is the handle the showcase selects
 * by, so letting a form change it would let an edit make the card disappear.
 */
export async function updateStatement(
  _prevState: StatementActionState | null,
  formData: FormData,
): Promise<StatementActionState> {
  const actor = await resolveEditor();
  if (!actor.ok) return { success: false, error: actor.error };

  const statementId = readId(formData, 'statementId');
  if (statementId === null) {
    return { success: false, error: 'Missing statement reference.' };
  }

  const title = readString(formData, 'title');
  const statement = readString(formData, 'statement');
  const subtext = readNullableString(formData, 'subtext');

  if (title === '') return { success: false, error: 'Enter a heading.' };
  if (title.length > MAX_STATEMENT_TITLE) {
    return {
      success: false,
      error: `Heading must be ${MAX_STATEMENT_TITLE} characters or fewer.`,
    };
  }
  if (statement === '') {
    return { success: false, error: 'Enter the statement text.' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('company_statements')
    .update({
      title,
      statement,
      subtext,
      // updated_at is maintained by trg_company_statements_set_updated_at.
      updated_by: actor.profile.id,
    })
    .eq('id', statementId);

  if (error) {
    return { success: false, error: describeDatabaseError(error) };
  }

  revalidateMilestones();

  return { success: true, data: { statementId, title } };
}

/* -------------------------------------------------------------------------- */
/* Milestones                                                                 */
/* -------------------------------------------------------------------------- */

interface MilestoneFields {
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
function readMilestoneFields(
  formData: FormData,
): { ok: true; fields: MilestoneFields } | { ok: false; error: string } {
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
    fields: {
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

export async function createMilestone(
  _prevState: MilestoneActionState | null,
  formData: FormData,
): Promise<MilestoneActionState> {
  const actor = await resolveEditor();
  if (!actor.ok) return { success: false, error: actor.error };

  const parsed = readMilestoneFields(formData);
  if (!parsed.ok) return { success: false, error: parsed.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('company_milestones')
    .insert(parsed.fields)
    .select('id')
    .single();

  if (error) {
    return { success: false, error: describeDatabaseError(error) };
  }

  revalidateMilestones();

  return { success: true, data: { milestoneId: data.id } };
}

export async function updateMilestone(
  _prevState: MilestoneActionState | null,
  formData: FormData,
): Promise<MilestoneActionState> {
  const actor = await resolveEditor();
  if (!actor.ok) return { success: false, error: actor.error };

  const milestoneId = readId(formData, 'milestoneId');
  if (milestoneId === null) {
    return { success: false, error: 'Missing milestone reference.' };
  }

  const parsed = readMilestoneFields(formData);
  if (!parsed.ok) return { success: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from('company_milestones')
    .update(parsed.fields)
    .eq('id', milestoneId);

  if (error) {
    return { success: false, error: describeDatabaseError(error) };
  }

  revalidateMilestones();

  return { success: true, data: { milestoneId } };
}

/**
 * Removes a milestone outright.
 *
 * Called directly rather than through `useActionState`, since there is no form to
 * carry — the confirmation happens in the UI. Deletion is permanent: the table
 * keeps no history and nothing references a milestone, so there is nothing to
 * cascade and nothing to restore from.
 */
export async function deleteMilestone(
  milestoneId: string,
): Promise<MilestoneActionState> {
  const actor = await resolveEditor();
  if (!actor.ok) return { success: false, error: actor.error };

  if (!UUID_PATTERN.test(milestoneId)) {
    return { success: false, error: 'Missing milestone reference.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('company_milestones')
    .delete()
    .eq('id', milestoneId);

  if (error) {
    return { success: false, error: describeDatabaseError(error) };
  }

  revalidateMilestones();

  return { success: true, data: { milestoneId } };
}
