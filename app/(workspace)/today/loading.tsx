import { PageSkeleton } from '@/shared/ui/page-skeleton';

/** Today: title, the roadmap, then the week's cards. */
export default function TodayLoading() {
  return <PageSkeleton label="Loading today" panels={['h-72', 'h-56']} />;
}
