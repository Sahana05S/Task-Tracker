import { createClient } from '@/shared/supabase/client';

import { PROOFS_BUCKET } from './rules';

/**
 * Sends a proof to the signed upload link the server made for it. PRIVATE;
 * re-exported through `client.ts`. Returns an error message, or null when the
 * file arrived.
 */
export async function uploadProofToTicket(ticket: { path: string; token: string }, file: File, mimeType: string): Promise<string | null> {
  const { error } = await createClient().storage.from(PROOFS_BUCKET)
    .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: mimeType, upsert: false });
  if (!error) return null;
  if (/exists|duplicate/i.test(error.message)) return null;
  return `The file did not upload: ${error.message}`;
}
