'use server';

import { revalidatePath } from 'next/cache';

import { runLabelCommand, runLabelLinkCommand } from '@/modules/labels/internal/commands';
import { cleanLabelName, isLabelSubjectKind, LABEL_COLOURS, LABEL_NAME_MAX, type Label, type LabelColour } from '@/modules/labels/internal/rules';
import { readString, UUID_PATTERN } from '@/shared/forms/form-data';
import { resolveActor } from '@/shared/session/actor';
import type { ActionResponse } from '@/types/tracker';

/**
 * PUBLIC Server Actions for labels (migration 112). The database decides who
 * may manage labels (label_command: managing director and managers)
 * and who may label a record (label_link_command); these check the shape.
 */

const RETRY = 'Reload the page and try again.';

function revalidate(path: string) {
  // Only a same-site path the caller is on; everything else waits for the page's refresh.
  if (/^\/[A-Za-z0-9/_%.-]*$/.test(path)) revalidatePath(path);
  revalidatePath('/labels', 'layout');
}

function colourOf(value: string): LabelColour | null {
  return (LABEL_COLOURS as readonly string[]).includes(value) ? value as LabelColour : null;
}

/** create / rename (name, colour, description) / archive / restore. */
export async function manageLabel(form: FormData): Promise<ActionResponse<Label>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error, errorCode: 'forbidden' };
  const op = readString(form, 'op'), labelId = readString(form, 'labelId'), operationId = readString(form, 'operationId');
  const name = cleanLabelName(readString(form, 'name')), colour = colourOf(readString(form, 'colour'));
  const description = form.has('description') ? readString(form, 'description').trim().slice(0, 300) : null;
  if (!['create', 'rename', 'archive', 'restore'].includes(op) || !UUID_PATTERN.test(operationId)
    || (op !== 'create' && !UUID_PATTERN.test(labelId))) return { success: false, error: RETRY, errorCode: 'validation' };
  if ((op === 'create' || op === 'rename') && (!name || name.length > LABEL_NAME_MAX)) {
    return { success: false, error: `A label needs a name of up to ${LABEL_NAME_MAX} characters.`, errorCode: 'validation' };
  }
  const result = await runLabelCommand({
    op: op as 'create' | 'rename' | 'archive' | 'restore', labelId: op === 'create' ? null : labelId,
    name: op === 'create' || op === 'rename' ? name : null, colour, description, operationId,
  });
  if (!result.ok) return { success: false, error: result.error, errorCode: result.code };
  revalidate(readString(form, 'path'));
  return { success: true, data: result.label };
}

/** attach (by labelId, or by name: a manager may create it) / detach. */
export async function changeLabelLink(form: FormData): Promise<ActionResponse<Label>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error, errorCode: 'forbidden' };
  const op = readString(form, 'op'), kind = readString(form, 'kind'), subjectId = readString(form, 'subjectId');
  const labelId = readString(form, 'labelId'), operationId = readString(form, 'operationId'), name = cleanLabelName(readString(form, 'name'));
  if ((op !== 'attach' && op !== 'detach') || !isLabelSubjectKind(kind) || !UUID_PATTERN.test(subjectId) || !UUID_PATTERN.test(operationId)
    || (labelId ? !UUID_PATTERN.test(labelId) : !name || name.length > LABEL_NAME_MAX)) {
    return { success: false, error: RETRY, errorCode: 'validation' };
  }
  const result = await runLabelLinkCommand({ op, kind, subjectId, labelId: labelId || null, name: labelId ? null : name, operationId });
  if (!result.ok) return { success: false, error: result.error, errorCode: result.code };
  revalidate(readString(form, 'path'));
  return { success: true, data: result.label };
}
