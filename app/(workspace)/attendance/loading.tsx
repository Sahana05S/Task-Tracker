import { PageSkeleton } from '@/shared/ui/page-skeleton';

/** Attendance: the record form and the per-member day tables. */
export default function AttendanceLoading() {
  return <PageSkeleton label="Loading attendance" panels={['h-28', 'h-96']} />;
}
