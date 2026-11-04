import 'server-only';

import { createClient } from '@/shared/supabase/server';

import { serviceAccountEmail } from './google';
import { checkConnection, moveFiles } from './move';
import type { FileStorageHealth } from './rules';

const UNAVAILABLE: FileStorageHealth = { available: false, configured: false, connected: false, driveName: null, account: null, moved: 0, pending: 0, error: null };

/**
 * File storage health for Reports > Data checks (managing director, migration
 * 100): the database's counts plus a live check that the service account can
 * reach the Shared Drive. Opening the page also retries files still waiting.
 */
export async function readFileStorageHealth(): Promise<FileStorageHealth> {
  const supabase = await createClient();
  const [{ data, error }, { data: organizationId }] = await Promise.all([supabase.rpc('file_storage_status'), supabase.rpc('current_organization')]);
  if (error || !data || !organizationId) return UNAVAILABLE;
  const status = data as unknown as { configured: boolean; moved: number; pending: number; lastError: string | null };
  // The service account is named even before a drive is connected, so it can be added as a member first.
  if (!status.configured) return { ...UNAVAILABLE, available: true, account: serviceAccountEmail(), pending: status.pending };
  const live = await checkConnection(organizationId);
  if (live.ok && status.pending > 0) await moveFiles(organizationId, []);
  return {
    available: true, configured: true, connected: live.ok, driveName: live.driveName, account: live.account,
    moved: Number(status.moved), pending: Number(status.pending), error: live.ok ? status.lastError : live.error,
  };
}
