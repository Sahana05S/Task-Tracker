// PUBLIC client-safe exports: types and pure helpers only (no server imports).
export {
  filterNotes,
  hashtagLine,
  hasNoteType,
  NOTE_MAX_HASHTAGS,
  NOTE_MAX_LENGTH,
  noteHashtagCounts,
  noteTypeLabels,
  type MissionNote,
  type MissionNotes,
  type NoteNodeKind,
} from '@/modules/learning/internal/rules';
