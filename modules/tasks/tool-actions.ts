'use server';

import { revalidateAfterToolCommit } from '@/modules/tasks/internal/cache';
import type { ToolsPreview } from '@/modules/tasks/internal/tools/contract';
import { commitPreview, requestPreview, type CommittedItems, type Reply } from '@/modules/tasks/internal/tools/commands';
import { getCurrentProfile } from '@/shared/session/profile';
import type { Json } from '@/types/database';

/**
 * PUBLIC Server Actions for Task Tools operations (duplicate, support split,
 * refresh...). Every batch is previewed first and committed atomically.
 */

const NOT_SIGNED_IN = { success: false as const, error: 'An active signed-in account is required.' };

export async function previewTaskTool(command: string, payload: Record<string, Json | undefined>): Promise<Reply<ToolsPreview>> {
  const actor = await getCurrentProfile();
  if (!actor?.isActive) return NOT_SIGNED_IN;
  return requestPreview(command, payload);
}

export async function commitTaskTool(previewId: string, operationId: string): Promise<Reply<CommittedItems>> {
  const actor = await getCurrentProfile();
  if (!actor?.isActive) return NOT_SIGNED_IN;
  const result = await commitPreview(previewId, operationId);
  if (result.success) revalidateAfterToolCommit();
  return result;
}
