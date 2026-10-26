// PUBLIC client-safe exports of the personnel module: types, pure rules and
// the browser half of an upload (no server imports).
export {
  canViewPersonalRecords,
  fileProblem,
  formatFileSize,
  isRecordKind,
  MAX_COLLEGE_FILES,
  MAX_RECORD_BYTES,
  RECORD_ACCEPT,
  RECORD_KIND_HINTS,
  RECORD_KIND_LABELS,
  RECORD_KINDS,
  recordPath,
  recordProgress,
  type RecordKind,
} from '@/modules/personnel/internal/rules';
export type { PersonalDocument, PersonalRecords, RecordsSummaryRow } from '@/modules/personnel/internal/mappers';
export { uploadToTicket } from '@/modules/personnel/internal/upload';
