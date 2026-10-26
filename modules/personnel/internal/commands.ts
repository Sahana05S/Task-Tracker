import 'server-only';

import { isConflictCode } from '@/shared/commands/conflict';
import { createClient } from '@/shared/supabase/server';
import { isMissingFunctionError } from '@/shared/supabase/schema-errors';

import { recordPath, RECORDS_BUCKET, type RecordKind } from './rules';

/**
 * Personal records writes (migration 78). PRIVATE. The file goes straight
 * from the browser to storage through a signed upload link made here as the
 * signed-in member (the bucket's policies allow only their own folder), so
 * files up to 5 MB never pass through a server request. The command then
 * records it; `personal_record_command` is the permission boundary.
 */

type Db = Awaited<ReturnType<typeof createClient>>;
type Failure = { ok: false; error: string; code: 'forbidden' | 'validation' | 'conflict' | 'unavailable' };

export interface UploadTicket {
  readonly path: string;
  readonly token: string;
}

async function callerOrganization(supabase: Db): Promise<string | null> {
  const { data, error } = await supabase.rpc('current_organization');
  return error ? null : data;
}

export async function createUploadTicket(userId: string, kind: RecordKind, fileId: string, mimeType: string): Promise<{ ok: true; ticket: UploadTicket } | Failure> {
  const supabase = await createClient();
  const organizationId = await callerOrganization(supabase);
  if (!organizationId) return { ok: false, error: 'Your account is not part of an active company.', code: 'forbidden' };
  const path = recordPath(organizationId, userId, kind, fileId, mimeType);
  const { data, error } = await supabase.storage.from(RECORDS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    if (error && /bucket not found/i.test(error.message)) return { ok: false, error: 'Personal records need the latest database update (migration 78).', code: 'unavailable' };
    return { ok: false, error: `The upload could not start: ${error?.message ?? 'no link was returned'}`, code: 'unavailable' };
  }
  return { ok: true, ticket: { path, token: data.token } };
}

function failure(error: { code?: string; message: string }): Failure {
  if (isMissingFunctionError(error)) return { ok: false, error: 'Personal records need the latest database update (migration 78).', code: 'unavailable' };
  if (isConflictCode(error.code)) return { ok: false, error: 'This upload was sent twice with different details. Try again.', code: 'conflict' };
  // The command raises plain-language messages for refusals and invalid input.
  if (error.code === '42501') return { ok: false, error: error.message, code: 'forbidden' };
  if (['23514', '23505', 'P0002'].includes(error.code ?? '')) return { ok: false, error: error.message, code: 'validation' };
  return { ok: false, error: `The record was not saved: ${error.message}`, code: 'unavailable' };
}

/** Removes files no active record points at; the bucket refuses anything else. */
async function discard(supabase: Db, paths: readonly string[]): Promise<void> {
  if (paths.length) await supabase.storage.from(RECORDS_BUCKET).remove([...paths]);
}

export async function addRecord(input: {
  kind: RecordKind; path: string; fileName: string; mimeType: string; sizeBytes: number; operationId: string;
}): Promise<{ ok: true } | Failure> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('personal_record_command', {
    p_op: 'add', p_kind: input.kind, p_path: input.path, p_file_name: input.fileName, p_mime_type: input.mimeType,
    p_size_bytes: input.sizeBytes, p_record: null, p_operation: input.operationId,
  });
  if (error) {
    await discard(supabase, [input.path]);
    return failure(error);
  }
  await discard(supabase, released(data));
  return { ok: true };
}

export async function withdrawRecord(recordId: string, operationId: string): Promise<{ ok: true } | Failure> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('personal_record_command', {
    p_op: 'withdraw', p_kind: null, p_path: null, p_file_name: null, p_mime_type: null, p_size_bytes: null,
    p_record: recordId, p_operation: operationId,
  });
  if (error) return failure(error);
  await discard(supabase, released(data));
  return { ok: true };
}

function released(data: unknown): string[] {
  const value = typeof data === 'object' && data !== null ? (data as { released?: unknown }).released : null;
  return Array.isArray(value) ? value.map(String) : [];
}
