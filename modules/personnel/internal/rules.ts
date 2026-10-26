/**
 * Personal records rules (M19, migration 78). PRIVATE; re-exported through
 * `client.ts`. The database repeats every check; these give instant answers.
 */

export const RECORD_KINDS = ['class10', 'class12', 'aadhaar', 'college'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export const RECORD_KIND_LABELS: Record<RecordKind, string> = {
  class10: '10th marksheet',
  class12: '12th marksheet',
  aadhaar: 'Aadhaar card',
  college: 'College marksheet',
};

export const RECORD_KIND_HINTS: Record<RecordKind, string> = {
  class10: 'Class 10 board marksheet.',
  class12: 'Class 12 board marksheet.',
  aadhaar: 'Front and back in one PDF, or a clear photo.',
  college: 'One file per semester or year; up to 12.',
};

/** Private bucket of migration 78; objects at <organization>/<user>/<kind>/<uuid>.<ext>. */
export const RECORDS_BUCKET = 'personal-documents';

/** Largest file the bucket accepts (5 MB). */
export const MAX_RECORD_BYTES = 5 * 1024 * 1024;
export const MAX_COLLEGE_FILES = 12;

/** Accepted file types and the extension each is stored under. */
export const RECORD_MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
export const RECORD_ACCEPT = Object.keys(RECORD_MIME_EXTENSIONS).join(',');

export function isRecordKind(value: string): value is RecordKind {
  return (RECORD_KINDS as readonly string[]).includes(value);
}

/** Why a file can't be used, or null when it can. */
export function fileProblem(file: { size: number; type: string }): string | null {
  if (!file.size) return 'The file is empty.';
  if (!(file.type in RECORD_MIME_EXTENSIONS)) return 'Upload a PDF, JPEG, PNG or WebP file.';
  if (file.size > MAX_RECORD_BYTES) return 'Files must be 5 MB or smaller.';
  return null;
}

/** <organization>/<user>/<kind>/<uuid>.<ext>, the only path the bucket and the command accept. */
export function recordPath(organizationId: string, userId: string, kind: RecordKind, fileId: string, mimeType: string): string {
  return `${organizationId}/${userId}/${kind}/${fileId}.${RECORD_MIME_EXTENSIONS[mimeType]}`;
}

/** The kinds a person has at least one file for, and whether all four are there. */
export function recordProgress(kinds: readonly string[]): { done: number; total: number; complete: boolean; missing: RecordKind[] } {
  const missing = RECORD_KINDS.filter(kind => !kinds.includes(kind));
  return { done: RECORD_KINDS.length - missing.length, total: RECORD_KINDS.length, complete: missing.length === 0, missing };
}

/** "1.2 MB", "340 KB". */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Only the person and the managing director see a Personal info tab. */
export function canViewPersonalRecords(viewer: { id: string; role: string }, ownerId: string): boolean {
  return viewer.id === ownerId || viewer.role === 'managing_director';
}
