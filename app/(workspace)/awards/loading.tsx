import { PageSkeleton } from '@/shared/ui/page-skeleton';

/** Awards: the category cards and the monthly star. */
export default function AwardsLoading() {
  return <PageSkeleton label="Loading the awards ceremony" panels={['h-72', 'h-56']} />;
}
