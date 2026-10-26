import { createClient } from '@/shared/supabase/client';

import { RECORDS_BUCKET } from './rules';

/**
 * Sends a file to the signed upload link the server made for it. PRIVATE;
 * re-exported through `client.ts` for the upload card. The link is good for
 * one path in the member's own folder only; recording the file is a Server
 * Action. Returns an error message, or null when the file arrived.
 */
export async function uploadToTicket(ticket: { path: string; token: string }, file: File): Promise<string | null> {
  const { error } = await createClient().storage.from(RECORDS_BUCKET)
    .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type, upsert: false });
  if (!error) return null;
  // The same attempt sent again after a lost response.
  if (/exists|duplicate/i.test(error.message)) return null;
  return `The file did not upload: ${error.message}`;
}
