'use server';

import { revalidatePath } from 'next/cache';

import { runConductCommand } from '@/modules/hr/internal/conduct';
import { CONDUCT_BODY_MAX, CONDUCT_TITLE_MAX } from '@/modules/hr/internal/rules';
import { readString, UUID_PATTERN } from '@/shared/forms/form-data';
import { resolveActor } from '@/shared/session/actor';
import type { ActionResponse } from '@/types/tracker';

/**
 * PUBLIC Server Actions for the Code of Conduct. The role check only gives a
 * friendly message; `code_of_conduct_command` enforces it.
 */

function parseVersion(form: FormData): { version: number; operationId: string } | null {
  const version = Number(readString(form, 'version')), operationId = readString(form, 'operationId');
  return Number.isInteger(version) && version >= 0 && UUID_PATTERN.test(operationId) ? { version, operationId } : null;
}

/** Publishes a new version (managing director). `version` is the one that was edited (0 when none). */
export async function publishConduct(form: FormData): Promise<ActionResponse<{ version: number }>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error, errorCode: 'forbidden' };
  if (actor.profile.role !== 'managing_director') {
    return { success: false, error: 'Only the managing director can publish the Code of Conduct.', errorCode: 'forbidden' };
  }
  const ids = parseVersion(form);
  const title = readString(form, 'title').trim(), body = readString(form, 'body').trim();
  if (!ids) return { success: false, error: 'Reload the page and try again.', errorCode: 'validation' };
  if (!title || title.length > CONDUCT_TITLE_MAX) return { success: false, error: `Give it a title of up to ${CONDUCT_TITLE_MAX} characters.`, errorCode: 'validation' };
  if (!body || body.length > CONDUCT_BODY_MAX) return { success: false, error: `The text must be 1-${CONDUCT_BODY_MAX} characters.`, errorCode: 'validation' };
  const result = await runConductCommand({ op: 'publish', title, body, ...ids });
  if (!result.ok) return { success: false, error: result.error };
  revalidatePath('/hr', 'layout');
  return { success: true, data: { version: result.version } };
}

/** The signed-in member accepts the version they read. */
export async function acknowledgeConduct(form: FormData): Promise<ActionResponse<{ version: number }>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error, errorCode: 'forbidden' };
  const ids = parseVersion(form);
  if (!ids || ids.version < 1) return { success: false, error: 'Reload the page and try again.', errorCode: 'validation' };
  const result = await runConductCommand({ op: 'acknowledge', title: null, body: null, ...ids });
  if (!result.ok) return { success: false, error: result.error };
  revalidatePath('/hr', 'layout');
  revalidatePath('/today');
  return { success: true, data: { version: result.version } };
}
