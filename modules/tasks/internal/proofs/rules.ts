/**
 * Mission proof and document rules (migrations 101, 113). PRIVATE; re-exported through `client.ts`.
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

/** What a mission file is (migration 113): a proof, or an Input / Process / Output document. */
export const MISSION_FILE_KINDS = ['proof', 'input', 'process', 'output'] as const;
export type MissionFileKind = (typeof MISSION_FILE_KINDS)[number];
/** The three document kinds, in the order the Files panel shows them (Proofs come last). */
export const MISSION_DOCUMENT_KINDS = ['input', 'process', 'output'] as const satisfies readonly MissionFileKind[];
export type MissionDocumentKind = (typeof MISSION_DOCUMENT_KINDS)[number];

export function isMissionFileKind(value: unknown): value is MissionFileKind {
  return typeof value === 'string' && (MISSION_FILE_KINDS as readonly string[]).includes(value);
}

/** One mission file; rows from databases before 113 have no kind and are proofs. */
export interface MissionProof extends ProofFile {
  readonly kind: MissionFileKind;
}

/** The files of one kind. */
export function missionFilesOfKind(files: readonly MissionProof[], kind: MissionFileKind): MissionProof[] {
  return files.filter((file) => file.kind === kind);
}

/** The Shared Drive folder a mission file is moved into (mirrors taskpulse_private.file_subject). */
export function missionFileFolder(task: { taskTag: string | null; title: string; assignedDate: string | null }, kind: MissionFileKind, uploadedOn: string): string[] {
  const month = (task.assignedDate ?? uploadedOn).slice(0, 7);
  const mission = `${task.taskTag ?? 'Mission'} - ${task.title.trim() || 'Untitled'}`.slice(0, 200);
  if (kind === 'proof') return ['Proofs', month, mission];
  return ['Missions', month, mission, kind.charAt(0).toUpperCase() + kind.slice(1)];
}
