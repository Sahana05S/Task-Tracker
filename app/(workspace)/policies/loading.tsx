import { PageSkeleton } from '@/shared/ui/page-skeleton';

/** Policies: the stat tiles, the policy list and commendations. */
export default function PoliciesLoading() {
  return <PageSkeleton label="Loading policies" panels={['h-72', 'h-40']} />;
}
