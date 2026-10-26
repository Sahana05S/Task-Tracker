// PUBLIC server-side API of the personnel module (personal records, M19).
import 'server-only';

export * from '@/modules/personnel/client';
export type { PersonalRecordsView, RecordsRead } from '@/modules/personnel/internal/queries';

/** One member's records with short-lived viewing links: their own, or anyone's for the managing director. */
export { readPersonalRecords as getPersonalRecords } from '@/modules/personnel/internal/queries';
/** Every active member's uploaded kinds (managing director only); null when unreadable. */
export { readRecordsSummary as getRecordsSummary } from '@/modules/personnel/internal/queries';
/** The kinds the signed-in member has uploaded; null when unreadable. */
export { readOwnRecordKinds as getOwnRecordKinds } from '@/modules/personnel/internal/queries';
