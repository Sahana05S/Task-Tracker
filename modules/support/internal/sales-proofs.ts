import 'server-only';

import { fileViewHref, mapProofRow, proofPath, scheduleDriveMove, scheduleDriveRelease, type ProofFile } from '@/modules/files';
import { isConflictCode } from '@/shared/commands/conflict';
import { createClient } from '@/shared/supabase/server';
import { isMissingFunctionError } from '@/shared/supabase/schema-errors';

/**
 * Sales proofs (migration 102). PRIVATE. Who may: the entry's salesperson, the
 * managing director and project engineers (user decision, 2 November 2026);
 * `sale_proofs`, `sale_proof_command` and the bucket's policies enforce it.
 * Uploads land in the sales-proofs bucket through a signed link; the files
 * module moves each into Proofs/<YYYY-MM>/Sales/<entry>/ in the Shared Drive.
 */

export const SALES_PROOFS_BUCKET = 'sales-proofs';
const OUTDATED = 'Sales proofs need the latest database update (migration 102).';

type Db = Awaited<ReturnType<typeof createClient>>;
type Failure = { ok: false; error: string; code: 'forbidden' | 'validation' | 'conflict' | 'unavailable' };

export interface SaleProofState { readonly canAdd: boolean; readonly proofs: readonly ProofFile[] }

/** Proofs of the entries the caller may see, keyed by entry id; entries left out show no proofs block. */
export async function readSaleProofs(saleIds: readonly string[]): Promise<Record<string, SaleProofState>> {
  if (!saleIds.length) return {};
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('sale_proofs', { p_sales: [...saleIds].slice(0, 500) });
  if (error || !data || typeof data !== 'object') return {};
  const out: Record<string, SaleProofState> = {};
  for (const [id, value] of Object.entries(data as Record<string, { canAdd?: boolean; proofs?: Record<string, unknown>[] }>)) {
    out[id] = { canAdd: value.canAdd === true, proofs: (value.proofs ?? []).map((row) => mapProofRow(row, (path) => fileViewHref(SALES_PROOFS_BUCKET, path))) };
  }
  return out;
}

async function callerOrganization(supabase: Db): Promise<string | null> {
  const { data, error } = await supabase.rpc('current_organization');
  return error ? null : data;
}

export async function createSaleProofTicket(saleId: string, fileId: string, mimeType: string): Promise<{ ok: true; ticket: { path: string; token: string } } | Failure> {
  const supabase = await createClient();
  const organizationId = await callerOrganization(supabase);
  if (!organizationId) return { ok: false, error: 'Your account is not part of an active company.', code: 'forbidden' };
  const path = proofPath(organizationId, saleId, fileId, mimeType);
  const { data, error } = await supabase.storage.from(SALES_PROOFS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    if (error && /bucket not found/i.test(error.message)) return { ok: false, error: OUTDATED, code: 'unavailable' };
    if (error && /row-level security|unauthorized|403/i.test(error.message)) return { ok: false, error: 'Only the salesperson and managers can add proofs to this entry.', code: 'forbidden' };
    return { ok: false, error: `The upload could not start: ${error?.message ?? 'no link was returned'}`, code: 'unavailable' };
  }
  return { ok: true, ticket: { path, token: data.token } };
}

function failure(error: { code?: string; message: string }): Failure {
  if (isMissingFunctionError(error)) return { ok: false, error: OUTDATED, code: 'unavailable' };
  if (isConflictCode(error.code)) return { ok: false, error: 'This upload was sent twice with different details. Try again.', code: 'conflict' };
  if (error.code === '42501') return { ok: false, error: error.message, code: 'forbidden' };
  if (['23514', '23505', 'P0002'].includes(error.code ?? '')) return { ok: false, error: error.message, code: 'validation' };
  return { ok: false, error: `The proof was not saved: ${error.message}`, code: 'unavailable' };
}

function released(data: unknown): string[] {
  const value = typeof data === 'object' && data !== null ? (data as { released?: unknown }).released : null;
  return Array.isArray(value) ? value.map(String) : [];
}

async function afterChange(supabase: Db, releasedPaths: string[], addedPath: string | null): Promise<void> {
  if (releasedPaths.length) await supabase.storage.from(SALES_PROOFS_BUCKET).remove(releasedPaths);
  const organizationId = await callerOrganization(supabase);
  if (!organizationId) return;
  scheduleDriveRelease(organizationId, SALES_PROOFS_BUCKET, releasedPaths);
  if (addedPath) scheduleDriveMove(organizationId, SALES_PROOFS_BUCKET, addedPath);
}

export async function addSaleProof(input: { saleId: string; path: string; fileName: string; mimeType: string; sizeBytes: number; operationId: string }): Promise<{ ok: true } | Failure> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('sale_proof_command', {
    p_op: 'add', p_sale: input.saleId, p_path: input.path, p_file_name: input.fileName, p_mime_type: input.mimeType,
    p_size_bytes: input.sizeBytes, p_proof: null, p_operation: input.operationId,
  });
  if (error) {
    await supabase.storage.from(SALES_PROOFS_BUCKET).remove([input.path]);
    return failure(error);
  }
  await afterChange(supabase, released(data), input.path);
  return { ok: true };
}

export async function withdrawSaleProof(saleId: string, proofId: string, operationId: string): Promise<{ ok: true } | Failure> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('sale_proof_command', {
    p_op: 'withdraw', p_sale: saleId, p_path: null, p_file_name: null, p_mime_type: null, p_size_bytes: null,
    p_proof: proofId, p_operation: operationId,
  });
  if (error) return failure(error);
  await afterChange(supabase, released(data), null);
  return { ok: true };
}
