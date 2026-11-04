import 'server-only';

import { createClient } from '@/shared/supabase/server';
import { isMissingFunctionError } from '@/shared/supabase/schema-errors';
import { workerClient, workerConnection } from '@/shared/supabase/worker';

import { serviceAccountEmail } from './google';
import { SHARED_DRIVE_ID, sharedDriveIdFrom } from './rules';

/**
 * Connects the company's Shared Drive (`file_storage_configure`, migration 100).
 * PRIVATE. The function is the permission boundary (active managing director)
 * and writes the audit row.
 */
export async function configureFileStorage(raw: string): Promise<{ ok: true; sharedDriveId: string } | { ok: false; error: string }> {
  const sharedDriveId = sharedDriveIdFrom(raw);
  if (!SHARED_DRIVE_ID.test(sharedDriveId)) return { ok: false, error: 'Paste the Shared Drive id (the code at the end of the drive\'s address).' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('file_storage_configure', { p_shared_drive_id: sharedDriveId });
  if (error) {
    if (isMissingFunctionError(error)) return { ok: false, error: 'File storage needs the latest database update (migration 100).' };
    if (error.code === '42501' || error.code === '23514') return { ok: false, error: error.message };
    return { ok: false, error: `The Shared Drive was not connected: ${error.message}` };
  }
  return { ok: true, sharedDriveId };
}

/**
 * Whether new uploads of the caller's company move into the Shared Drive: the
 * service account key is set and a drive is connected. Any member may ask (the
 * answer only chooses honest wording); a failed read counts as not connected.
 */
export async function readFileStorageReady(): Promise<boolean> {
  if (!serviceAccountEmail()) return false;
  const connection = workerConnection();
  if (!connection) return false;
  try {
    const supabase = await createClient();
    const { data: organizationId } = await supabase.rpc('current_organization');
    if (!organizationId) return false;
    const { data, error } = await workerClient(connection.url, connection.key, organizationId).rpc('file_storage_drive');
    return !error && typeof data === 'string' && data.length > 0;
  } catch {
    return false;
  }
}
