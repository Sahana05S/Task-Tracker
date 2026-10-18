import type { DriveReadModel } from '@/modules/drive/components/drive-operations';
import { createClient } from '@/shared/supabase/server';

/** The Drive jobs/assets read model for Task Tools, or null when unavailable. PRIVATE. */
export async function getDriveReadModel(): Promise<DriveReadModel | null> {
  const db = await createClient();
  const result = await db.rpc('drive_read_model', {});
  return result.error ? null : (result.data as unknown as DriveReadModel);
}
