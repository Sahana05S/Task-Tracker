import 'server-only';

import { after } from 'next/server';

import { moveFiles, releaseFiles } from './internal/move';
import type { FileBucket } from './internal/rules';

/**
 * PUBLIC server API of the files module: company files in the Google Shared
 * Drive (go-live Part F, migration 100). Other modules keep their own records
 * and permission rules; this module moves their stored files into the drive,
 * trashes released ones and serves every view after a permission check.
 */

export { handleFileView } from './internal/view';
export { readFileStorageHealth as getFileStorageHealth } from './internal/status';
export * from './client';

/** After the response: moves a newly recorded file into the Shared Drive (and retries a few waiting ones). */
export function scheduleDriveMove(organizationId: string, bucket: FileBucket, path: string): void {
  after(() => moveFiles(organizationId, [{ bucket, path }]));
}

/** After the response: sends the Drive copies of files a record no longer uses to the Shared Drive's trash. */
export function scheduleDriveRelease(organizationId: string, bucket: FileBucket, paths: readonly string[]): void {
  if (paths.length) after(() => releaseFiles(organizationId, bucket, paths));
}
