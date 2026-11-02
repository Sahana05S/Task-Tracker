/**
 * Proof file rules shared by mission and sales proofs (migrations 101-102).
 * PRIVATE; re-exported through `client.ts`. Pure, safe for the browser; the
 * database repeats every check (taskpulse_private.proof_extension).
 */

/** 25 MB, the user's limit (2 November 2026). */
export const MAX_PROOF_BYTES = 25 * 1024 * 1024;

/** Accepted types and the extension each is stored under. */
export const PROOF_MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};

const BY_EXTENSION: Record<string, string> = Object.fromEntries(
  Object.entries(PROOF_MIME_EXTENSIONS).map(([mime, ext]) => [ext, mime]).concat([['jpeg', 'image/jpeg']]),
);

/** For the file picker: the types and their extensions (phones often report no type for HEIC). */
export const PROOF_ACCEPT = [...Object.keys(PROOF_MIME_EXTENSIONS), ...Object.keys(BY_EXTENSION).map((ext) => `.${ext}`)].join(',');

/** The file's type, from the browser or, when it gives none, from the name's extension. */
export function proofMimeType(file: { name: string; type: string }): string {
  if (file.type in PROOF_MIME_EXTENSIONS) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXTENSION[ext] ?? file.type;
}

/** Why a file can't be a proof, or null when it can. */
export function proofFileProblem(file: { size: number; type: string }): string | null {
  if (!file.size) return 'The file is empty.';
  if (!(file.type in PROOF_MIME_EXTENSIONS)) return 'Upload a PDF, a photo (JPEG, PNG, WebP, HEIC) or a Word, Excel or PowerPoint file.';
  if (file.size > MAX_PROOF_BYTES) return 'Files must be 25 MB or smaller.';
  return null;
}

/** <organization>/<owner record>/<uuid>.<ext>, the only path the proof buckets and commands accept. */
export function proofPath(organizationId: string, ownerId: string, fileId: string, mimeType: string): string {
  return `${organizationId}/${ownerId}/${fileId}.${PROOF_MIME_EXTENSIONS[mimeType]}`;
}

/** "1.2 MB", "340 KB". */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** One proof as the panels show it. */
export interface ProofFile {
  readonly id: string;
  readonly path: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly uploadedAt: string;
  readonly uploaderName: string | null;
  readonly canRemove: boolean;
  /** The permission-checked viewing link (`/api/files`). */
  readonly href: string;
}

/** Maps one proof row from a proofs read (task_proofs, sale_proofs). */
export function mapProofRow(row: Record<string, unknown>, href: (path: string) => string): ProofFile {
  const path = String(row.path);
  return {
    id: String(row.id), path, fileName: String(row.fileName), mimeType: String(row.mimeType), sizeBytes: Number(row.sizeBytes),
    uploadedAt: String(row.uploadedAt), uploaderName: row.uploaderName ? String(row.uploaderName) : null,
    canRemove: row.canRemove === true, href: href(path),
  };
}
