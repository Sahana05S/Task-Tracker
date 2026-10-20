import { PageSkeleton } from '@/shared/ui/page-skeleton';

/** Member profile: summary tiles, then the report and chart panels. */
export default function EmployeeLoading() {
  return <PageSkeleton label="Loading the profile" tiles={5} panels={['h-72', 'h-72']} />;
}
