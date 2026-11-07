import 'server-only';

// PUBLIC server-side API of the businesses module (migration 134).
export * from '@/modules/businesses/client';
export { getBusinesses, getBusinessSummary, getBusinessView, getMyBusinessIds } from '@/modules/businesses/internal/queries';
