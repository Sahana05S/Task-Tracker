import { PageSkeleton } from '@/shared/ui/page-skeleton';

/** A meeting: the header, the minutes and the points. */
export default function MeetingLoading() {
  return <PageSkeleton label="Loading meeting" panels={['h-24', 'h-80', 'h-56']} />;
}
