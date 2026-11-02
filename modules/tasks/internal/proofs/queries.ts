import 'server-only';

import { fileViewHref } from '@/modules/files/client';
import { createClient } from '@/shared/supabase/server';

import { PROOFS_BUCKET, type MissionProof } from './rules';

/**
 * A mission's proofs (migration 101). PRIVATE. Null when the caller is not one
 * of the mission's people or a manager, or the database predates 101: the
 * page then shows no Proofs panel.
 */
export async function readTaskProofs(taskId: string): Promise<MissionProof[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('task_proofs', { p_task: taskId });
  if (error || !Array.isArray(data)) return null;
  return (data as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    path: String(row.path),
    fileName: String(row.fileName),
    mimeType: String(row.mimeType),
    sizeBytes: Number(row.sizeBytes),
    uploadedAt: String(row.uploadedAt),
    uploaderName: row.uploaderName ? String(row.uploaderName) : null,
    canRemove: row.canRemove === true,
    href: fileViewHref(PROOFS_BUCKET, String(row.path)),
  }));
}
