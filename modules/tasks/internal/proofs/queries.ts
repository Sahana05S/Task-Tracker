import 'server-only';

import { fileViewHref } from '@/modules/files/client';
import { createClient } from '@/shared/supabase/server';

import { isMissionFileKind, PROOFS_BUCKET, type MissionProof } from './rules';

/**
 * A mission's proofs and Input / Process / Output documents (migrations 101,
 * 113), each with its kind. PRIVATE. Null when the caller is not one of the
 * mission's people or a manager, or the database predates 101: the page then
 * sees only the links in the Files panel: no uploads and no Proofs group.
 */
export async function readTaskProofs(taskId: string): Promise<MissionProof[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('task_proofs', { p_task: taskId });
  if (error || !Array.isArray(data)) return null;
  return (data as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    kind: isMissionFileKind(row.kind) ? row.kind : 'proof',
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
