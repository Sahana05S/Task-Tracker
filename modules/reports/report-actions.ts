'use server';

import { revalidatePath } from 'next/cache';

import { createReportSnapshot } from '@/modules/reports/internal/snapshots';
import { resolveActor } from '@/shared/session/actor';
import type { ActionResponse } from '@/types/tracker';

/** PUBLIC Server Action: store a report snapshot (managing director only; RLS enforces it). */
export async function generateReportSnapshotAction(formData: FormData): Promise<ActionResponse<{ reportId: string }>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (actor.profile.role !== 'managing_director') {
    return { success: false, error: 'Only the managing director can create report snapshots.' };
  }

  const result = await createReportSnapshot(formData, actor.profile.id);
  if (!result.ok) return { success: false, error: result.error };

  revalidatePath('/reports');
  revalidatePath('/team');
  return { success: true, data: { reportId: result.reportId } };
}
