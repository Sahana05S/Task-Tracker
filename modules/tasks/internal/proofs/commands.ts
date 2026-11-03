import 'server-only';

import { scheduleDriveMove, scheduleDriveRelease } from '@/modules/files';
import { isConflictCode } from '@/shared/commands/conflict';
import { createClient } from '@/shared/supabase/server';
import { isMissingFunctionError } from '@/shared/supabase/schema-errors';

import { proofPath, PROOFS_BUCKET, type MissionFileKind } from './rules';

/**
 * Mission proof and Input / Process / Output document writes (migrations 101,
 * 113). PRIVATE. The file goes from the
 * browser straight to the mission's folder in the upload bucket through a
 * signed link (the bucket's policies check the mission's people and managers),
 * `task_proof_command` records it, then the files module moves it into the
 * Shared Drive after the response.
 */

type Db = Awaited<ReturnType<typeof createClient>>;
type Failure = { ok: false; error: string; code: 'forbidden' | 'validation' | 'conflict' | 'unavailable' };

export interface ProofUploadTicket { readonly path: string; readonly token: string }

const OUTDATED = 'Mission proofs need the latest database update (migration 101).';
const OUTDATED_DOCUMENTS = 'Input, Process and Output uploads need the latest database update (migration 113).';

async function callerOrganization(supabase: Db): Promise<string | null> {
  const { data, error } = await supabase.rpc('current_organization');
  return error ? null : data;
}

export async function createProofTicket(taskId: string, fileId: string, mimeType: string): Promise<{ ok: true; ticket: ProofUploadTicket } | Failure> {
  const supabase = await createClient();
  const organizationId = await callerOrganization(supabase);
  if (!organizationId) return { ok: false, error: 'Your account is not part of an active company.', code: 'forbidden' };
  const path = proofPath(organizationId, taskId, fileId, mimeType);
  const { data, error } = await supabase.storage.from(PROOFS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    if (error && /bucket not found/i.test(error.message)) return { ok: false, error: OUTDATED, code: 'unavailable' };
    if (error && /row-level security|unauthorized|403/i.test(error.message)) return { ok: false, error: 'Only the mission\'s people and managers can add proofs.', code: 'forbidden' };
    return { ok: false, error: `The upload could not start: ${error?.message ?? 'no link was returned'}`, code: 'unavailable' };
  }
  return { ok: true, ticket: { path, token: data.token } };
}

function failure(error: { code?: string; message: string }, kind: MissionFileKind = 'proof'): Failure {
  if (isMissingFunctionError(error)) return { ok: false, error: kind === 'proof' ? OUTDATED : OUTDATED_DOCUMENTS, code: 'unavailable' };
  if (isConflictCode(error.code)) return { ok: false, error: 'This upload was sent twice with different details. Try again.', code: 'conflict' };
  if (error.code === '42501') return { ok: false, error: error.message, code: 'forbidden' };
  if (['23514', '23505', 'P0002'].includes(error.code ?? '')) return { ok: false, error: error.message, code: 'validation' };
  return { ok: false, error: `The file was not saved: ${error.message}`, code: 'unavailable' };
}

function released(data: unknown): string[] {
  const value = typeof data === 'object' && data !== null ? (data as { released?: unknown }).released : null;
  return Array.isArray(value) ? value.map(String) : [];
}

async function afterChange(supabase: Db, releasedPaths: string[], addedPath: string | null): Promise<void> {
  if (releasedPaths.length) await supabase.storage.from(PROOFS_BUCKET).remove(releasedPaths);
  const organizationId = await callerOrganization(supabase);
  if (!organizationId) return;
  scheduleDriveRelease(organizationId, PROOFS_BUCKET, releasedPaths);
  if (addedPath) scheduleDriveMove(organizationId, PROOFS_BUCKET, addedPath);
}

export async function addProof(input: { taskId: string; kind: MissionFileKind; path: string; fileName: string; mimeType: string; sizeBytes: number; operationId: string }): Promise<{ ok: true } | Failure> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('task_proof_command', {
    p_op: 'add', p_task: input.taskId, p_path: input.path, p_file_name: input.fileName, p_mime_type: input.mimeType,
    p_size_bytes: input.sizeBytes, p_proof: null, p_operation: input.operationId,
    // Before migration 113 the command has no kind; a proof then still saves.
    ...(input.kind === 'proof' ? {} : { p_kind: input.kind }),
  });
  if (error) {
    await supabase.storage.from(PROOFS_BUCKET).remove([input.path]);
    return failure(error, input.kind);
  }
  await afterChange(supabase, released(data), input.path);
  return { ok: true };
}

export async function withdrawProof(taskId: string, proofId: string, operationId: string): Promise<{ ok: true } | Failure> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('task_proof_command', {
    p_op: 'withdraw', p_task: taskId, p_path: null, p_file_name: null, p_mime_type: null, p_size_bytes: null,
    p_proof: proofId, p_operation: operationId,
  });
  if (error) return failure(error);
  await afterChange(supabase, released(data), null);
  return { ok: true };
}
