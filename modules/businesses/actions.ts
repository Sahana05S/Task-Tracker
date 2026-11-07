'use server';

import { revalidatePath } from 'next/cache';

import { runBusinessCommand, runTaskBusinessCommand, runUserBusinessesCommand, type BusinessOp } from '@/modules/businesses/internal/commands';
import { BUSINESS_NAME_MAX, isBusinessColour, type Business } from '@/modules/businesses/internal/rules';
import { readString, UUID_PATTERN } from '@/shared/forms/form-data';
import { resolveActor } from '@/shared/session/actor';
import type { ActionResponse } from '@/types/tracker';

/**
 * PUBLIC Server Actions for businesses (migration 134). The database decides
 * who may do what (business_command and user_businesses_command: the managing
 * director; task_business_command: the managing director, Managers and the
 * mission's Crew); these check the shape.
 */

const RETRY = 'Reload the page and try again.';

function refreshBusinessViews(): void {
  for (const path of ['/tasks', '/today', '/settings']) revalidatePath(path);
  revalidatePath('/team', 'layout');
  revalidatePath('/tasks', 'layout');
}

/** create / update (name, colour, order) / archive / restore. */
export async function manageBusiness(form: FormData): Promise<ActionResponse<Business>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error, errorCode: 'forbidden' };
  const op = readString(form, 'op'), businessId = readString(form, 'businessId'), operationId = readString(form, 'operationId');
  const name = readString(form, 'name').replace(/\s+/g, ' ').trim();
  const colourText = readString(form, 'colour');
  const sortText = readString(form, 'sort');
  if (!['create', 'update', 'archive', 'restore'].includes(op) || !UUID_PATTERN.test(operationId)
    || (op !== 'create' && !UUID_PATTERN.test(businessId))) return { success: false, error: RETRY, errorCode: 'validation' };
  const editsFields = op === 'create' || op === 'update';
  if (editsFields && (!name || name.length > BUSINESS_NAME_MAX)) {
    return { success: false, error: `A business needs a name of up to ${BUSINESS_NAME_MAX} characters.`, errorCode: 'validation' };
  }
  const sort = sortText === '' ? null : Number(sortText);
  if (sort !== null && (!Number.isInteger(sort) || sort < 0 || sort > 999)) {
    return { success: false, error: 'Order is a whole number from 0 to 999.', errorCode: 'validation' };
  }
  const result = await runBusinessCommand({
    op: op as BusinessOp,
    businessId: op === 'create' ? null : businessId,
    name: editsFields ? name : null,
    colour: editsFields && isBusinessColour(colourText) ? colourText : null,
    sort: editsFields ? sort : null,
    operationId,
  });
  if (!result.ok) return { success: false, error: result.error, errorCode: result.code };
  refreshBusinessViews();
  return { success: true, data: result.business };
}

/** Replaces one person's businesses (Team profile; the managing director). */
export async function setPersonBusinesses(form: FormData): Promise<ActionResponse<{ businessIds: string[] }>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error, errorCode: 'forbidden' };
  const userId = readString(form, 'userId'), operationId = readString(form, 'operationId');
  const businessIds = form.getAll('businessId').filter((v): v is string => typeof v === 'string' && v !== '');
  if (!UUID_PATTERN.test(userId) || !UUID_PATTERN.test(operationId) || businessIds.some((id) => !UUID_PATTERN.test(id)) || businessIds.length > 50) {
    return { success: false, error: RETRY, errorCode: 'validation' };
  }
  const result = await runUserBusinessesCommand({ userId, businessIds: [...new Set(businessIds)], operationId });
  if (!result.ok) return { success: false, error: result.error, errorCode: result.code };
  refreshBusinessViews();
  return { success: true, data: { businessIds: result.businessIds } };
}

/** Sets or clears a mission's business (mission page; the managing director, Managers and the Crew). */
export async function setMissionBusiness(form: FormData): Promise<ActionResponse<{ businessId: string | null }>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error, errorCode: 'forbidden' };
  const taskId = readString(form, 'taskId'), businessId = readString(form, 'businessId'), operationId = readString(form, 'operationId');
  if (!UUID_PATTERN.test(taskId) || !UUID_PATTERN.test(operationId) || (businessId !== '' && !UUID_PATTERN.test(businessId))) {
    return { success: false, error: RETRY, errorCode: 'validation' };
  }
  const result = await runTaskBusinessCommand({ taskId, businessId: businessId || null, operationId });
  if (!result.ok) return { success: false, error: result.error, errorCode: result.code };
  refreshBusinessViews();
  revalidatePath('/tasks/[taskTag]', 'page');
  return { success: true, data: { businessId: result.businessId } };
}
