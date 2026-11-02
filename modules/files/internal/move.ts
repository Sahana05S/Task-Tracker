import 'server-only';

import { workerClient, workerConnection } from '@/shared/supabase/worker';

import { DriveError, existingFile, fileKey, folderFor, serviceAccountEmail, sharedDriveName, trashFile, uploadFile } from './google';
import type { FileBucket } from './rules';

/**
 * Moving stored files into the Shared Drive (migration 100). PRIVATE. Runs on
 * the server as the service role for one company (x-taskpulse-organization);
 * the database decides where each file belongs and records the Drive id. The
 * inbox copy in Supabase storage is deleted only after the move is recorded,
 * so a failure at any step leaves the file viewable and retried later.
 */

type Service = NonNullable<ReturnType<typeof serviceFor>>;

function serviceFor(organizationId: string) {
  const connection = workerConnection();
  return connection ? workerClient(connection.url, connection.key, organizationId) : null;
}

interface Claim {
  state: 'unconfigured' | 'gone' | 'moved' | 'pending';
  sharedDriveId?: string;
  folders?: { key: string; name: string }[];
  driveName?: string;
  mimeType?: string;
}

async function moveOne(db: Service, bucket: FileBucket, path: string): Promise<'moved' | 'pending' | 'skipped'> {
  const { data, error } = await db.rpc('file_move_claim', { p_bucket: bucket, p_path: path });
  if (error) throw new Error(`file_move_claim: ${error.message}`);
  const claim = data as unknown as Claim;
  if (claim.state === 'unconfigured' || claim.state === 'gone') return 'skipped';
  if (claim.state === 'moved') {
    await db.storage.from(bucket).remove([path]);
    return 'moved';
  }
  try {
    const driveId = claim.sharedDriveId!;
    let parent = driveId;
    for (const folder of claim.folders ?? []) parent = await folderFor(driveId, parent, folder.key, folder.name);
    const key = fileKey(bucket, path);
    let driveFileId = await existingFile(driveId, parent, key);
    if (!driveFileId) {
      const { data: blob, error: readError } = await db.storage.from(bucket).download(path);
      if (readError || !blob) throw new Error(`The stored copy could not be read: ${readError?.message ?? 'missing'}`);
      driveFileId = await uploadFile({ parentId: parent, name: claim.driveName ?? 'File', mimeType: claim.mimeType ?? blob.type, key, body: await blob.arrayBuffer() });
    }
    const { error: finishError } = await db.rpc('file_move_finish', { p_bucket: bucket, p_path: path, p_drive_file_id: driveFileId, p_error: null });
    if (finishError) throw new Error(`file_move_finish: ${finishError.message}`);
    await db.storage.from(bucket).remove([path]);
    return 'moved';
  } catch (error) {
    const message = error instanceof DriveError || error instanceof Error ? error.message : 'Move failed';
    await db.rpc('file_move_finish', { p_bucket: bucket, p_path: path, p_drive_file_id: null, p_error: message });
    return 'pending';
  }
}

/**
 * Moves the named files, then up to a few older ones still waiting (retries).
 * Never throws: a file that cannot move stays in storage and is retried.
 */
export async function moveFiles(organizationId: string, files: readonly { bucket: FileBucket; path: string }[]): Promise<void> {
  if (!serviceAccountEmail()) return;
  const db = serviceFor(organizationId);
  if (!db) return;
  try {
    for (const file of files) await moveOne(db, file.bucket, file.path);
    const { data } = await db.rpc('file_move_pending', { p_limit: 3 });
    for (const file of (data as unknown as { bucket: FileBucket; path: string }[] | null) ?? []) await moveOne(db, file.bucket, file.path);
  } catch (error) {
    console.error('Drive file move failed', error instanceof Error ? error.message : error);
  }
}

/** Sends the Drive copies of released paths to the Shared Drive's trash. Never throws. */
export async function releaseFiles(organizationId: string, bucket: FileBucket, paths: readonly string[]): Promise<void> {
  if (!paths.length) return;
  const db = serviceFor(organizationId);
  if (!db) return;
  try {
    const { data, error } = await db.rpc('file_release', { p_bucket: bucket, p_paths: [...paths] });
    if (error) throw new Error(`file_release: ${error.message}`);
    if (!serviceAccountEmail()) return;
    for (const id of (data as unknown as { trash?: string[] } | null)?.trash ?? []) await trashFile(id);
  } catch (error) {
    console.error('Drive file release failed', error instanceof Error ? error.message : error);
  }
}

/** Live connection check for Data checks; records the result for the company. */
export async function checkConnection(organizationId: string): Promise<{ ok: boolean; driveName: string | null; error: string | null; account: string | null }> {
  const account = serviceAccountEmail();
  if (!account) return { ok: false, driveName: null, error: 'The service account key (TASKPULSE_DRIVE_SERVICE_ACCOUNT_JSON) is not set on the server.', account };
  const db = serviceFor(organizationId);
  if (!db) return { ok: false, driveName: null, error: 'The server has no service-role connection.', account };
  const { data: driveId } = await db.rpc('file_storage_drive');
  if (!driveId) return { ok: false, driveName: null, error: 'No Shared Drive is connected yet.', account };
  try {
    const driveName = await sharedDriveName(driveId as string);
    await db.rpc('file_storage_checked', { p_ok: true, p_error: null });
    return { ok: true, driveName, error: null, account };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Check failed';
    await db.rpc('file_storage_checked', { p_ok: false, p_error: message });
    return { ok: false, driveName: null, error: message, account };
  }
}
