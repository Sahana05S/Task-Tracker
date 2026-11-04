import { sendToSignedUpload } from '@/shared/supabase/signed-upload';

import { PROOFS_BUCKET } from './rules';

/**
 * Sends a proof to the signed upload link the server made for it. PRIVATE;
 * re-exported through `client.ts`. Returns an error message, or null when the
 * file arrived.
 */
export async function uploadProofToTicket(ticket: { path: string; token: string }, file: File, mimeType: string): Promise<string | null> {
  return sendToSignedUpload(PROOFS_BUCKET, ticket, file, mimeType);
}
