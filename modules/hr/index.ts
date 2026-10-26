// PUBLIC server-side API of the hr module (M19: HR documents and reviews).
import 'server-only';

export * from '@/modules/hr/client';

/** The current Code of Conduct, the caller's acceptance and (managing director) everyone's; null before migration 80. */
export { readCodeOfConduct as getCodeOfConduct } from '@/modules/hr/internal/conduct';
