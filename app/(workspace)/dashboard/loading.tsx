import { Skeleton } from '@/components/ui/skeleton';

/**
 * Dashboard route loading state.
 *
 * The analytics engine runs on the server across tasks, logs and members, so this
 * boundary is the one most likely to be seen. It mirrors the real composition:
 * star performer banner, four stat cards, then the two chart panels.
 */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-4">
      <span role="status" className="sr-only">
        Loading team performance
      </span>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-72" />
        </div>
        <Skeleton className="h-8 w-36" />
      </div>

      {/* Star performer banner */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 bg-slate-100 px-4 py-4 sm:px-6">
          <Skeleton className="size-12 shrink-0 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-44" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="ml-auto flex flex-col items-end gap-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-7 w-16" />
          </div>
        </div>

        <div className="grid grid-cols-2 border-b border-slate-200 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="flex flex-col gap-1.5 px-4 py-3 sm:px-6"
            >
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 px-4 py-3 sm:px-6">
          <Skeleton className="h-3 w-44" />
          <div className="flex flex-wrap gap-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-3 w-40" />
            ))}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3"
          >
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-44" />
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-3 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={index}
            className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4"
          >
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-64" />
            <Skeleton className="h-56 w-full rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
