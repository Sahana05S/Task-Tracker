import 'server-only';

// PUBLIC server-side API of the labels module (migration 112).
export * from '@/modules/labels/client';
export { getLabelCatalogue, getLabelled, getLabelsFor } from '@/modules/labels/internal/queries';
