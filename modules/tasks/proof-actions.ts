'use server';

import { revalidatePath } from 'next/cache';

import { addProof, createProofTicket, withdrawProof, type ProofUploadTicket } from '@/modules/tasks/internal/proofs/commands';
import { isMissionFileKind, proofFileProblem } from '@/modules/tasks/internal/proofs/rules';
import { readString, UUID_PATTERN } from '@/shared/forms/form-data';
import { resolveActor } from '@/shared/session/actor';
import type { ActionResponse } from '@/types/tracker';

/**
 * PUBLIC Server Actions for mission proofs (migration 101): `startProofUpload`
 * makes a signed upload link in the mission's folder, the browser sends the
 * file there (`uploadProofToTicket`), then `saveProof` records it. The
 * bucket's policies and `task_proof_command` enforce who may. The same three
 * actions add Input / Process / Output documents (migration 113): the form's
 * `kind` field is `input`, `process` or `output` (absent means a proof).
 */

const RETRY = 'Reload the page and try again.';

function revalidateMission(taskTag: string) {
  if (taskTag) revalidatePath(`/tasks/${encodeURIComponent(taskTag)}`);
}

export async function startProofUpload(form: FormData): Promise<ActionResponse<ProofUploadTicket>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error, errorCode: 'forbidden' };
  const taskId = readString(form, 'taskId'), fileId = readString(form, 'fileId'), mimeType = readString(form, 'mimeType');
  const size = Number(readString(form, 'size'));
  if (!UUID_PATTERN.test(taskId) || !UUID_PATTERN.test(fileId)) return { success: false, error: RETRY, errorCode: 'validation' };
  const problem = proofFileProblem({ size, type: mimeType });
  if (problem) return { success: false, error: problem, errorCode: 'validation' };
  const result = await createProofTicket(taskId, fileId, mimeType);
  return result.ok ? { success: true, data: result.ticket } : { success: false, error: result.error, errorCode: result.code };
}

export async function saveProof(form: FormData): Promise<ActionResponse<null>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error, errorCode: 'forbidden' };
  const taskId = readString(form, 'taskId'), taskTag = readString(form, 'taskTag'), path = readString(form, 'path');
  const operationId = readString(form, 'operationId'), mimeType = readString(form, 'mimeType');
  const fileName = readString(form, 'fileName').slice(0, 200).trim(), sizeBytes = Number(readString(form, 'size'));
  const kind = readString(form, 'kind') || 'proof';
  if (!UUID_PATTERN.test(taskId) || !path || !UUID_PATTERN.test(operationId) || !isMissionFileKind(kind)) return { success: false, error: RETRY, errorCode: 'validation' };
  const problem = proofFileProblem({ size: sizeBytes, type: mimeType });
  if (problem) return { success: false, error: problem, errorCode: 'validation' };
  const result = await addProof({ taskId, kind, path, fileName: fileName || (kind === 'proof' ? 'Proof' : 'Document'), mimeType, sizeBytes, operationId });
  if (!result.ok) return { success: false, error: result.error, errorCode: result.code };
  revalidateMission(taskTag);
  return { success: true, data: null };
}

export async function removeProof(form: FormData): Promise<ActionResponse<null>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error, errorCode: 'forbidden' };
  const taskId = readString(form, 'taskId'), taskTag = readString(form, 'taskTag');
  const proofId = readString(form, 'proofId'), operationId = readString(form, 'operationId');
  if (![taskId, proofId, operationId].every((id) => UUID_PATTERN.test(id))) return { success: false, error: RETRY, errorCode: 'validation' };
  const result = await withdrawProof(taskId, proofId, operationId);
  if (!result.ok) return { success: false, error: result.error, errorCode: result.code };
  revalidateMission(taskTag);
  return { success: true, data: null };
}
