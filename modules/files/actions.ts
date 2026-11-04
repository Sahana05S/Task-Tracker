'use server';

import { revalidatePath } from 'next/cache';

import { configureFileStorage } from '@/modules/files/internal/connect';
import { resolveActor } from '@/shared/session/actor';
import type { ActionResponse } from '@/types/tracker';

/**
 * PUBLIC Server Actions of the files module. The role check only gives a
 * friendly message; `file_storage_configure` enforces it in the database.
 */

export type ConnectSharedDriveState = ActionResponse<{ sharedDriveId: string }>;

/** Settings > Company: connects (or changes) the company's Shared Drive. Managing director only, audited. */
export async function connectSharedDrive(_prev: ConnectSharedDriveState | null, form: FormData): Promise<ConnectSharedDriveState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (actor.profile.role !== 'managing_director') return { success: false, error: 'Only a managing director can connect the Shared Drive.' };
  const result = await configureFileStorage(String(form.get('sharedDriveId') ?? ''));
  if (!result.ok) return { success: false, error: result.error };
  // Upload wording across the workspace depends on whether the drive is connected.
  revalidatePath('/', 'layout');
  return { success: true, data: { sharedDriveId: result.sharedDriveId } };
}
