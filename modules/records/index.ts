// PUBLIC server-side API of the records module (dated records shared by
// attendance and support, and the company activity log). Commands are in
// '@/modules/records/actions'.

export { getRecordHistory, isRecordReference, RECORD_KINDS } from '@/modules/records/internal/history';
export type { RecordRevision } from '@/modules/records/internal/revisions';
export { getActivity, type ActivityPage } from '@/modules/records/internal/activity';
export { handleActivityExport } from '@/modules/records/internal/activity-export';
export { ACTIVITY_PAGE, activityFilter, parseCursor, seesAllActivity } from '@/modules/records/internal/activity-mapping';
