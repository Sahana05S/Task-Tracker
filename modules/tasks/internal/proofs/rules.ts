/**
 * Mission proof rules (migration 101). PRIVATE; re-exported through `client.ts`.
 * The file rules are shared with sales proofs and live in the files module.
 */

import type { ProofFile } from '@/modules/files/client';

export {
  formatFileSize as formatProofSize,
  MAX_PROOF_BYTES,
  PROOF_ACCEPT,
  PROOF_MIME_EXTENSIONS,
  proofFileProblem,
  proofMimeType,
  proofPath,
} from '@/modules/files/client';

/** Private bucket of migration 101; objects at <organization>/<task>/<uuid>.<ext>, then moved to the Shared Drive. */
export const PROOFS_BUCKET = 'mission-proofs';

export type MissionProof = ProofFile;
