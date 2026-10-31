import { PageSkeleton } from '@/shared/ui/page-skeleton';

/** Any workspace page without its own skeleton: shown while the server reads its data. */
export default function WorkspaceLoading() {
  return <PageSkeleton label="Loading" panels={['h-28', 'h-72']} />;
}
