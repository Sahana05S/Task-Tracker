/**
 * File storage rules (migration 100). PRIVATE; re-exported through `client.ts`.
 * Pure: no server code, safe for the browser.
 */

/** Supabase storage buckets whose files move into the Shared Drive. */
export const FILE_BUCKETS = ['personal-documents'] as const;
export type FileBucket = (typeof FILE_BUCKETS)[number];

export function isFileBucket(value: string): value is FileBucket {
  return (FILE_BUCKETS as readonly string[]).includes(value);
}

/** The app link that opens a stored file after a permission check (wherever it lives now). */
export function fileViewHref(bucket: FileBucket, path: string): string {
  return `/api/files?${new URLSearchParams({ b: bucket, p: path })}`;
}

export interface FileStorageHealth {
  /** False when the reader is not the managing director or the database predates migration 100. */
  readonly available: boolean;
  readonly configured: boolean;
  readonly connected: boolean;
  readonly driveName: string | null;
  readonly account: string | null;
  readonly moved: number;
  readonly pending: number;
  readonly error: string | null;
}

/** The Data checks line for file storage. */
export function fileStorageLine(health: FileStorageHealth): { text: string; attention: boolean } {
  if (!health.available) return { text: 'File storage status is not available on this database yet.', attention: true };
  if (!health.configured) return { text: 'Google Drive file storage is not connected yet. Documents stay in the app until it is.', attention: true };
  if (!health.connected) return { text: `Google Drive file storage cannot be reached: ${health.error ?? 'unknown error'}. Files stay in the app and move once it works again.`, attention: true };
  const waiting = health.pending ? ` ${health.pending} file${health.pending === 1 ? '' : 's'} waiting to move${health.error ? ` (last error: ${health.error})` : ''}.` : '';
  return {
    text: `Files are stored in the Shared Drive "${health.driveName}": ${health.moved} file${health.moved === 1 ? '' : 's'} so far.${waiting}`,
    attention: health.pending > 0 && Boolean(health.error),
  };
}
