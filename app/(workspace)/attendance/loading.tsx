import { Skeleton } from '@/components/ui/skeleton';

export default function AttendanceLoading() {
  return (
    <div className="flex flex-col gap-4 px-4 py-4 lg:px-6">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
