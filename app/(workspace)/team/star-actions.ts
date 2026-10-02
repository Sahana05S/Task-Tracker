'use server';

import { revalidatePath } from 'next/cache';

import { getCurrentProfile } from '@/lib/auth/profile';
import { storeDailyStarCalculation } from '@/lib/stars/daily';
import { canManageTasks } from '@/lib/tasks/permissions';
import type { ActionResponse, User } from '@/types/tracker';

export type DailyStarActionState = ActionResponse<{
  starDate: string;
  userId: string | null;
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
  return new Date().toISOString().slice(0, 10);
}

export async function calculateDailyStarAction(
  formData: FormData,
): Promise<DailyStarActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (!canManageTasks(actor.profile.role)) {
    return {
      success: false,
      error: 'Only managers can calculate and store daily stars.',
    };
  }

  const starDate = readString(formData, 'starDate') || todayIso();
  if (!ISO_DATE_PATTERN.test(starDate)) {
    return { success: false, error: 'Enter a valid star date.' };
  }

  try {
    const record = await storeDailyStarCalculation({ starDate });
    revalidateDailyStarViews();
    return {
      success: true,
      data: { starDate, userId: record?.userId ?? null },
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
  if (!canManageTasks(actor.profile.role)) {
    return {
      success: false,
      error: 'Only managers can override a daily star.',
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
    const record = await storeDailyStarCalculation({
      starDate,
      overrideUserId,
      overrideReason,
      overrideBy: actor.profile.id,
    });
    revalidateDailyStarViews();
    return {
      success: true,
      data: { starDate, userId: record?.userId ?? null },
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
