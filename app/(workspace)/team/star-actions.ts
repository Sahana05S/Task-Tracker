'use server';

import { revalidatePath } from 'next/cache';

import { getCurrentProfile } from '@/shared/session/profile';
import { storeDailyStarCalculation } from '@/lib/stars/daily';
import { commandIdentity } from '@/shared/commands/result';
import { kolkataDate } from '@/lib/tasks/contract';
import type { ActionResponse, User } from '@/types/tracker';

export type DailyStarActionState = ActionResponse<{
  starDate: string;
  userId: string | null;
  status:string;
}>;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Actor =
  | { readonly ok: true; readonly profile: User }
  | { readonly ok: false; readonly error: string };

async function resolveActor(): Promise<Actor> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'You are not signed in.' };
  if (!profile.isActive) return { ok: false, error: 'Your account is deactivated.' };
  return { ok: true, profile };
}

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function todayIso(): string {
  return kolkataDate();
}

export async function calculateDailyStarAction(
  formData: FormData,
): Promise<DailyStarActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (actor.profile.role !== 'managing_director') {
    return {
      success: false,
      error: 'Only the managing director can calculate and store daily stars.',
    };
  }

  const starDate = readString(formData, 'starDate') || todayIso();
  if (!ISO_DATE_PATTERN.test(starDate)) {
    return { success: false, error: 'Enter a valid star date.' };
  }

  try {
    const identity=commandIdentity(formData);if(!identity.operationId)return {success:false,error:'Operation key required.'};
    const record = await storeDailyStarCalculation({ starDate,operationId:identity.operationId });
    revalidateDailyStarViews();
    return {
      success: true,
      data: { starDate, userId: record.winnerId ?? null,status:record.status },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Could not calculate daily star.',
    };
  }
}

export async function overrideDailyStarAction(
  formData: FormData,
): Promise<DailyStarActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (actor.profile.role !== 'managing_director') {
    return {
      success: false,
      error: 'Only the managing director can override a daily star.',
    };
  }

  const starDate = readString(formData, 'starDate') || todayIso();
  const overrideUserId = readString(formData, 'overrideUserId');
  const overrideReason = readString(formData, 'overrideReason');

  if (!ISO_DATE_PATTERN.test(starDate)) {
    return { success: false, error: 'Enter a valid star date.' };
  }
  if (overrideUserId === '') {
    return { success: false, error: 'Select the corrected star performer.' };
  }
  if (overrideReason.length < 8) {
    return {
      success: false,
      error: 'Explain what source data was incorrect before overriding.',
    };
  }

  try {
    const identity=commandIdentity(formData);if(!identity.operationId||identity.version===null)return {success:false,error:'Current award version and operation key required.'};
    const record = await storeDailyStarCalculation({
      starDate,operationId:identity.operationId,expectedVersion:identity.version,runId:readString(formData,'runId'),
      overrideUserId,
      overrideReason,

    });
    revalidateDailyStarViews();
    return {
      success: true,
      data: { starDate, userId: record.winnerId ?? null,status:record.status },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Could not override daily star.',
    };
  }
}

function revalidateDailyStarViews(): void {
  revalidatePath('/team');
  revalidatePath('/dashboard');
}
