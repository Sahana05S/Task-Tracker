'use server';

import { revalidateAfterDetails, revalidateAfterTemplate } from '@/modules/tasks/internal/cache';
import { publishTemplate, runDetailsCommand } from '@/modules/tasks/internal/details-commands';
import { DETAIL_FIELDS } from '@/modules/tasks/internal/details-contract';
import { getCurrentProfile } from '@/shared/session/profile';
import type { Json } from '@/types/database';
import type { ActionResponse } from '@/types/tracker';

/**
 * PUBLIC Server Actions for a task's native details: the Input/Process/Output
 * sections, asset links, related tasks and the templates they start from.
 */

const read = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

const NOT_SIGNED_IN: ActionResponse<Json> = { success: false, error: 'Active authentication required.' };

/** Checks the caller and version, then runs one details command. */
async function execute(form: FormData, command: string, payload: Json): Promise<ActionResponse<Json>> {
  const profile = await getCurrentProfile();
  if (!profile?.isActive) return NOT_SIGNED_IN;

  const version = read(form, 'expectedVersion');
  if (!/^\d+$/.test(version)) return { success: false, error: 'Reload the task before saving.' };

  const result = await runDetailsCommand({
    taskId: read(form, 'taskId'),
    command,
    payload,
    expectedVersion: Number(version),
    operationId: read(form, 'operationId'),
  });
  if (result.success) revalidateAfterDetails();
  return result;
}

export async function initializeTaskDetails(form: FormData) {
  return execute(form, 'initialize', { template_version_id: read(form, 'templateVersionId') || null });
}

export async function saveTaskDetails(form: FormData) {
  const sections = DETAIL_FIELDS.filter((field) => form.has(field.key)).map((field) => [field.key, read(form, field.key)]);
  return execute(form, 'save', Object.fromEntries(sections));
}

export async function addTaskAsset(form: FormData) {
  return execute(form, 'link', {
    ipo_role: read(form, 'ipoRole'),
    link_type: read(form, 'linkType'),
    label: read(form, 'label'),
    url: read(form, 'url') || null,
    notes: read(form, 'notes') || null,
    employee_id: read(form, 'employeeId') || null,
    report_id: read(form, 'reportId') || null,
  });
}

export async function addTaskRelation(form: FormData) {
  return execute(form, 'relation', {
    other_task_id: read(form, 'otherTaskId'),
    relation_type: read(form, 'relationType'),
    notes: read(form, 'notes') || null,
  });
}

export async function renameNativeLink(form: FormData) {
  return execute(form, 'rename_link', { id: read(form, 'linkId'), label: read(form, 'label') });
}

export async function publishNativeTemplate(form: FormData): Promise<ActionResponse<Json>> {
  const profile = await getCurrentProfile();
  if (!profile?.isActive) return NOT_SIGNED_IN;

  let nodes: Json;
  try {
    nodes = JSON.parse(read(form, 'checklistNodes') || '[]');
  } catch {
    return { success: false, error: 'Checklist nodes must be valid JSON.' };
  }

  const result = await publishTemplate({
    templateId: read(form, 'templateId') || null,
    name: read(form, 'templateName'),
    expectedVersion: Number(read(form, 'templateVersion') || 0),
    operationId: read(form, 'operationId'),
    payload: {
      instructions: Object.fromEntries(DETAIL_FIELDS.map((field) => [field.key, read(form, 'instruction_' + field.key)])),
      checklist_nodes: nodes,
    },
  });
  if (result.success) revalidateAfterTemplate();
  return result;
}
