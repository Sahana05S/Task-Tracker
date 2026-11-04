import { sendToSignedUpload } from '@/shared/supabase/signed-upload';

import { RECORDS_BUCKET } from './rules';

/**
 * Sends a file to the signed upload link the server made for it. PRIVATE;
 * re-exported through `client.ts` for the upload card. The link is good for
 * one path in the member's own folder only; recording the file is a Server
 * Action. Returns an error message, or null when the file arrived.
 */
export async function uploadToTicket(ticket: { path: string; token: string }, file: File): Promise<string | null> {
  // A repeat after a lost response counts as arrived; see sendToSignedUpload.
  return sendToSignedUpload(RECORDS_BUCKET, ticket, file, file.type);
}
