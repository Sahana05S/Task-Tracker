import { sendToSignedUpload } from '@/shared/supabase/signed-upload';

import type { FileBucket } from './rules';

/**
 * Browser half of an upload: sends the file to the signed link the server made
 * for one path in a storage inbox bucket. PRIVATE; re-exported through
 * `client.ts`. Returns an error message, or null when the file arrived (a
 * repeat after a lost response counts as arrived).
 */
export async function uploadToSignedLink(bucket: FileBucket, ticket: { path: string; token: string }, file: File, mimeType: string): Promise<string | null> {
  return sendToSignedUpload(bucket, ticket, file, mimeType);
}
