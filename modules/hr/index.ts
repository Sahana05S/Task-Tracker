// PUBLIC server-side API of the hr module (M19: HR documents and reviews).
import 'server-only';

export * from '@/modules/hr/client';

/** The current Code of Conduct, the caller's acceptance and (managing director) everyone's; null before migration 80. */
export { readCodeOfConduct as getCodeOfConduct } from '@/modules/hr/internal/conduct';
/** Reviews the caller may see (managing director: all, with metrics and members); `unavailable` before migration 81. */
export { readReviewList as getReviewList } from '@/modules/hr/internal/reviews';
/** One review sheet; the director's side reaches the employee once completed. */
export { readReview as getReview } from '@/modules/hr/internal/reviews';
/** Reviews waiting on the member's own rating (Today's reminder). */
export { readPendingSelfReviews as getPendingSelfReviews } from '@/modules/hr/internal/reviews';
