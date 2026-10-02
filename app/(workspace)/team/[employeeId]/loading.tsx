import { Skeleton } from '@/components/ui/skeleton';

export default function EmployeeLoading() {
  return (
    <div className="grid gap-4 px-4 py-4 lg:px-6">
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
