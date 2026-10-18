'use server';

import { revalidatePath } from 'next/cache';

import { runDatedRecordCommand } from '@/modules/records/internal/commands';
import { parseDatedRecord } from '@/modules/records/internal/input';
import { getCurrentProfile } from '@/shared/session/profile';
import type { ActionResponse } from '@/types/tracker';

/**
 * PUBLIC Server Action for every dated record: save, withdraw or validate an
 * attendance record, daily fact, idea, suggestion, sales log or meeting point.
 * `dated_record_command` enforces permissions, versions and history.
 */
export async function writeDatedRecord(form: FormData): Promise<ActionResponse<{ id: string; version: number }>> {
  const profile = await getCurrentProfile();
  if (!profile?.isActive) return { success: false, error: 'Active authentication required.' };

  const input = parseDatedRecord(form);
  if (!input.ok) return { success: false, error: input.error };

  const result = await runDatedRecordCommand(input.value);
  if (result.success) {
    for (const path of ['/attendance', '/daily-facts', '/ideas', '/suggestions', '/sales', '/meeting-points', '/dashboard', '/team', '/task-tools']) {
      revalidatePath(path);
    }
  }
  return result;
}
