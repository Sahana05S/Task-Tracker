// PUBLIC server-side API of the records module (dated records shared by
// attendance and support). Commands are in '@/modules/records/actions'.

export { getRecordHistory, isRecordReference, RECORD_KINDS } from '@/modules/records/internal/history';
export type { RecordRevision } from '@/modules/records/internal/revisions';
