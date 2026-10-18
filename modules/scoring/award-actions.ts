'use server';

import { revalidateDailyStarViews } from '@/modules/scoring/internal/cache';
import { storeDailyStarCalculation } from '@/modules/scoring/internal/stars/daily';
import { commandIdentity } from '@/shared/commands/result';
import { ISO_DATE_PATTERN, readString } from '@/shared/forms/form-data';
import { resolveActor } from '@/shared/session/actor';
import { kolkataDate } from '@/shared/time/kolkata';
import type { ActionResponse } from '@/types/tracker';

/**
 * PUBLIC Server Actions for the daily star: request the calculation, or let
 * the managing director override it with a reason. `award_command` checks the
 * role and the award version; these checks give friendly messages first.
 */

export type DailyStarActionState = ActionResponse<{
  starDate: string;
  userId: string | null;
  status: string;
}>;

const failure = (error: string): DailyStarActionState => ({ success: false, error });

/** Resolves the caller and confirms they are the managing director. */
async function requireDirector(notAllowed: string) {
  const actor = await resolveActor();
  if (!actor.ok) return failure(actor.error);
  if (actor.profile.role !== 'managing_director') return failure(notAllowed);
  return null;
}

/** Runs the award command and turns its result or error into a form state. */
async function runAward(
  starDate: string,
  input: Parameters<typeof storeDailyStarCalculation>[0],
  fallbackError: string,
): Promise<DailyStarActionState> {
  try {
    const record = await storeDailyStarCalculation(input);
    revalidateDailyStarViews();
    return { success: true, data: { starDate, userId: record.winnerId ?? null, status: record.status } };
  } catch (error) {
    return failure(error instanceof Error ? error.message : fallbackError);
  }
}

export async function calculateDailyStarAction(formData: FormData): Promise<DailyStarActionState> {
  const refused = await requireDirector('Only the managing director can calculate and store daily stars.');
  if (refused) return refused;

  const starDate = readString(formData, 'starDate') || kolkataDate();
  if (!ISO_DATE_PATTERN.test(starDate)) return failure('Enter a valid star date.');

  const identity = commandIdentity(formData);
  if (!identity.operationId) return failure('Operation key required.');

  return runAward(starDate, { starDate, operationId: identity.operationId }, 'Could not calculate daily star.');
}

export async function overrideDailyStarAction(formData: FormData): Promise<DailyStarActionState> {
  const refused = await requireDirector('Only the managing director can override a daily star.');
  if (refused) return refused;

  const starDate = readString(formData, 'starDate') || kolkataDate();
  const overrideUserId = readString(formData, 'overrideUserId');
  const overrideReason = readString(formData, 'overrideReason');

  if (!ISO_DATE_PATTERN.test(starDate)) return failure('Enter a valid star date.');
  if (overrideUserId === '') return failure('Select the corrected star performer.');
  if (overrideReason.length < 8) return failure('Explain what source data was incorrect before overriding.');

  const identity = commandIdentity(formData);
  if (!identity.operationId || identity.version === null) {
    return failure('Current award version and operation key required.');
  }

  return runAward(
    starDate,
    {
      starDate,
      operationId: identity.operationId,
      expectedVersion: identity.version,
      runId: readString(formData, 'runId'),
      overrideUserId,
      overrideReason,
    },
    'Could not override daily star.',
  );
}
