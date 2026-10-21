'use server';
import { writeDatedRecord } from '@/modules/records/actions';

import { UUID_PATTERN } from '@/shared/forms/form-data';
import { resolveActor } from '@/shared/session/actor';
import type { ActionResponse } from '@/types/tracker';

import { revalidateSupportPaths } from './internal/cache';
import { deleteReportSnapshot, upsertReportSnapshot } from './internal/commands';
import { parseReportSnapshotId, parseReportSnapshotInput } from './internal/input';
import { getPostChoices, type PostChoices } from './internal/post-choices';
import { canManageReportSnapshots } from './internal/permissions';

type SupportActionState = ActionResponse<{ id: string }>;

export async function saveKnowledgeEntryAction(form:FormData){return writeDatedRecord(form);}
export async function deleteKnowledgeEntryAction(form:FormData){form.set('command','withdraw');return writeDatedRecord(form);}
export async function toggleKnowledgeValidationAction(form:FormData){form.set('command','validate');return writeDatedRecord(form);}
export async function saveSalesLogAction(form:FormData){form.set('kind','sale');return writeDatedRecord(form);}
export async function deleteSalesLogAction(form:FormData){form.set('kind','sale');form.set('command','withdraw');return writeDatedRecord(form);}

/** Members and open missions for the quick Post drawer, read when it opens. */
export async function loadPostChoices(includeTaskId?: string): Promise<ActionResponse<PostChoices>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  try {
    return { success: true, data: await getPostChoices(actor.profile, includeTaskId && UUID_PATTERN.test(includeTaskId) ? includeTaskId : undefined) };
  } catch {
    return { success: false, error: 'Missions and members could not be loaded. Close the drawer and try again.' };
  }
}

export async function saveReportSnapshotAction(
  formData: FormData,
): Promise<SupportActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (!canManageReportSnapshots(actor.profile.role)) {
    return { success: false, error: 'Only leadership can edit reports.' };
  }
  const input = parseReportSnapshotInput(formData);
  if (!input.ok) return { success: false, error: input.error };
  const result = await upsertReportSnapshot(input.value, actor.profile.id);
  if (!result.ok) return { success: false, error: result.error };
  revalidateSupportPaths();
  return { success: true, data: result.value };
}

export async function deleteReportSnapshotAction(
  formData: FormData,
): Promise<SupportActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (!canManageReportSnapshots(actor.profile.role)) {
    return { success: false, error: 'Only leadership can delete reports.' };
  }
  const id = parseReportSnapshotId(formData);
  if (!id.ok) return { success: false, error: id.error };
  const result = await deleteReportSnapshot(id.value);
  if (!result.ok) return { success: false, error: result.error };
  revalidateSupportPaths();
  return { success: true, data: result.value };
}
