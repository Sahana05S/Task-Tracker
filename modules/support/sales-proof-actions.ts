'use server';

import { revalidatePath } from 'next/cache';

import { proofFileProblem } from '@/modules/files/client';
import { addSaleProof, createSaleProofTicket, withdrawSaleProof } from '@/modules/support/internal/sales-proofs';
import { readString, UUID_PATTERN } from '@/shared/forms/form-data';
import { resolveActor } from '@/shared/session/actor';
import type { ActionResponse } from '@/types/tracker';

/**
 * PUBLIC Server Actions for sales proofs (migration 102): a signed upload link
 * in the entry's folder, then the record, then removal. The database decides
 * who may (the entry's salesperson, the managing director, project engineers).
 */

const RETRY = 'Reload the page and try again.';

export async function startSaleProofUpload(form: FormData): Promise<ActionResponse<{ path: string; token: string }>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error, errorCode: 'forbidden' };
  const saleId = readString(form, 'saleId'), fileId = readString(form, 'fileId'), mimeType = readString(form, 'mimeType');
  const size = Number(readString(form, 'size'));
  if (!UUID_PATTERN.test(saleId) || !UUID_PATTERN.test(fileId)) return { success: false, error: RETRY, errorCode: 'validation' };
  const problem = proofFileProblem({ size, type: mimeType });
  if (problem) return { success: false, error: problem, errorCode: 'validation' };
  const result = await createSaleProofTicket(saleId, fileId, mimeType);
  return result.ok ? { success: true, data: result.ticket } : { success: false, error: result.error, errorCode: result.code };
}

export async function saveSaleProof(form: FormData): Promise<ActionResponse<null>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error, errorCode: 'forbidden' };
  const saleId = readString(form, 'saleId'), path = readString(form, 'path'), operationId = readString(form, 'operationId');
  const mimeType = readString(form, 'mimeType'), fileName = readString(form, 'fileName').slice(0, 200).trim();
  const sizeBytes = Number(readString(form, 'size'));
  if (!UUID_PATTERN.test(saleId) || !path || !UUID_PATTERN.test(operationId)) return { success: false, error: RETRY, errorCode: 'validation' };
  const problem = proofFileProblem({ size: sizeBytes, type: mimeType });
  if (problem) return { success: false, error: problem, errorCode: 'validation' };
  const result = await addSaleProof({ saleId, path, fileName: fileName || 'Proof', mimeType, sizeBytes, operationId });
  if (!result.ok) return { success: false, error: result.error, errorCode: result.code };
  revalidatePath('/sales');
  return { success: true, data: null };
}

export async function removeSaleProof(form: FormData): Promise<ActionResponse<null>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error, errorCode: 'forbidden' };
  const saleId = readString(form, 'saleId'), proofId = readString(form, 'proofId'), operationId = readString(form, 'operationId');
  if (![saleId, proofId, operationId].every((id) => UUID_PATTERN.test(id))) return { success: false, error: RETRY, errorCode: 'validation' };
  const result = await withdrawSaleProof(saleId, proofId, operationId);
  if (!result.ok) return { success: false, error: result.error, errorCode: result.code };
  revalidatePath('/sales');
  return { success: true, data: null };
}
