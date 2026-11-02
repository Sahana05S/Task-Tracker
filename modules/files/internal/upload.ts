import { createClient } from '@/shared/supabase/client';

import type { FileBucket } from './rules';

/**
 * Browser half of an upload: sends the file to the signed link the server made
 * for one path in a storage inbox bucket. PRIVATE; re-exported through
 * `client.ts`. Returns an error message, or null when the file arrived (a
 * repeat after a lost response counts as arrived).
 */
export async function uploadToSignedLink(bucket: FileBucket, ticket: { path: string; token: string }, file: File, mimeType: string): Promise<string | null> {
  const { error } = await createClient().storage.from(bucket)
    .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: mimeType, upsert: false });
  if (!error) return null;
  if (/exists|duplicate/i.test(error.message)) return null;
  return `The file did not upload: ${error.message}`;
}
