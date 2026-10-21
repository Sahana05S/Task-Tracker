'use server';

// PUBLIC command of the recognition module: publish a month's award ceremony.
import { revalidatePath } from 'next/cache';

import { getCurrentProfile } from '@/shared/session/profile';
import type { ActionResponse } from '@/types/tracker';

import { publishCeremony } from '@/modules/recognition/internal/ceremony';
import { leaderboardPeriod } from '@/modules/recognition/internal/leaderboard';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Publishes (or republishes) the ceremony of an elapsed month. The managing
 * director check here only words the refusal; the database enforces it and
 * every other rule (elapsed month, current calculation, matching evidence).
 */
export async function publishCeremonyAction(form: FormData): Promise<ActionResponse<{ revisionNumber: number }>> {
  const actor = await getCurrentProfile();
  if (!actor?.isActive || actor.role !== 'managing_director') {
    return { success: false, error: 'Only the managing director can publish the ceremony.', errorCode: 'forbidden' };
  }
  const operationId = String(form.get('operationId') ?? '');
  const expectedRevision = Number(form.get('expectedVersion'));
  const reason = String(form.get('reason') ?? '').trim();
  if (!UUID.test(operationId) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return { success: false, error: 'Refresh the page and try again.', errorCode: 'validation' };
  }
  if ((expectedRevision > 0 || reason) && reason.length < 8) {
    return {
      success: false, errorCode: 'validation',
      error: expectedRevision > 0 ? 'Say why the ceremony is being published again (at least 8 characters).' : 'Make the note at least 8 characters, or leave it empty.',
    };
  }
  try {
    const period = leaderboardPeriod(String(form.get('month') ?? ''));
    const result = await publishCeremony(period, { reason, operationId, expectedRevision });
    revalidatePath('/awards');
    return { success: true, data: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Publishing failed.';
    return { success: false, error: message, errorCode: /refresh/i.test(message) ? 'conflict' : 'unavailable' };
  }
}
