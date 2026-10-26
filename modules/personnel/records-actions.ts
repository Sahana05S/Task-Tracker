'use server';

import { revalidatePath } from 'next/cache';

import { addRecord, createUploadTicket, withdrawRecord, type UploadTicket } from '@/modules/personnel/internal/commands';
import { fileProblem, isRecordKind, RECORD_KIND_LABELS } from '@/modules/personnel/internal/rules';
import { readString, UUID_PATTERN } from '@/shared/forms/form-data';
import { resolveActor } from '@/shared/session/actor';
import type { ActionResponse } from '@/types/tracker';

/**
 * PUBLIC Server Actions for personal records. A member uploads only their own:
 * `startRecordUpload` makes a signed upload link for one path in their folder,
 * the browser sends the file there (`uploadToTicket`), then `saveRecord`
 * records it. `personal_record_command` and the bucket's policies enforce it.
 */

const RETRY = 'Reload the page and try again.';

function revalidateRecords() {
  revalidatePath('/team', 'layout');
  revalidatePath('/today');
}

export async function startRecordUpload(form: FormData): Promise<ActionResponse<UploadTicket>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error, errorCode: 'forbidden' };
  const kind = readString(form, 'kind'), fileId = readString(form, 'fileId'), mimeType = readString(form, 'mimeType');
  const size = Number(readString(form, 'size'));
  if (!isRecordKind(kind) || !UUID_PATTERN.test(fileId)) return { success: false, error: RETRY, errorCode: 'validation' };
  const problem = fileProblem({ size, type: mimeType });
  if (problem) return { success: false, error: problem, errorCode: 'validation' };
  const result = await createUploadTicket(actor.profile.id, kind, fileId, mimeType);
  return result.ok ? { success: true, data: result.ticket } : { success: false, error: result.error, errorCode: result.code };
}

export async function saveRecord(form: FormData): Promise<ActionResponse<{ label: string }>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error, errorCode: 'forbidden' };
  const kind = readString(form, 'kind'), path = readString(form, 'path'), operationId = readString(form, 'operationId');
  const fileName = readString(form, 'fileName').slice(0, 200), mimeType = readString(form, 'mimeType');
  const sizeBytes = Number(readString(form, 'size'));
  if (!isRecordKind(kind) || !path || !UUID_PATTERN.test(operationId)) return { success: false, error: RETRY, errorCode: 'validation' };
  const problem = fileProblem({ size: sizeBytes, type: mimeType });
  if (problem) return { success: false, error: problem, errorCode: 'validation' };
  const result = await addRecord({ kind, path, fileName: fileName || RECORD_KIND_LABELS[kind], mimeType, sizeBytes, operationId });
  if (!result.ok) return { success: false, error: result.error, errorCode: result.code };
  revalidateRecords();
  return { success: true, data: { label: RECORD_KIND_LABELS[kind] } };
}

export async function removeRecord(form: FormData): Promise<ActionResponse<null>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error, errorCode: 'forbidden' };
  const recordId = readString(form, 'recordId'), operationId = readString(form, 'operationId');
  if (!UUID_PATTERN.test(recordId) || !UUID_PATTERN.test(operationId)) return { success: false, error: RETRY, errorCode: 'validation' };
  const result = await withdrawRecord(recordId, operationId);
  if (!result.ok) return { success: false, error: result.error, errorCode: result.code };
  revalidateRecords();
  return { success: true, data: null };
}
