import { PageSkeleton } from '@/shared/ui/page-skeleton';

/** Meetings: the title, the search and the month groups. */
export default function MeetingsLoading() {
  return <PageSkeleton label="Loading meetings" panels={['h-16', 'h-72']} />;
}
