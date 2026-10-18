// PUBLIC server-side API of the records module (dated records shared by
// attendance and support). Commands are in '@/modules/records/actions'.

export { getRecordHistory, isRecordReference, RECORD_KINDS, type RecordHistory } from '@/modules/records/internal/history';
