import { Skeleton } from '@/shared/ui/skeleton';

/**
 * Dashboard route loading state.
 *
 * The analytics engine runs on the server across tasks, logs and members, so this
 * boundary is the one most likely to be seen. It mirrors the real composition:
 * star performer banner, four metric cards, then the two chart panels.
 *
 * The leading metric card is drawn on the forest surface, matching the hero card
 * it stands in for, so the page does not change colour on arrival.
 */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-4">
      <span role="status" className="sr-only">
        Loading team performance
      </span>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 pt-2">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-40 rounded-full" />
      </div>

      {/* Star performer banner */}
      <div className="soft-card-clip">
        <div className="bg-primary-subtle flex flex-wrap items-center gap-4 px-5 py-5 sm:px-6">
          <Skeleton className="size-14 shrink-0 rounded-full bg-white/60" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-48 bg-white/60" />
            <Skeleton className="h-6 w-44 bg-white/60" />
            <Skeleton className="h-5 w-36 rounded-full bg-white/60" />
          </div>
          <div className="ml-auto flex flex-col items-end gap-2">
            <Skeleton className="h-3 w-28 bg-white/60" />
            <Skeleton className="h-8 w-20 bg-white/60" />
          </div>
        </div>

        <div className="border-border grid grid-cols-2 border-b sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex flex-col gap-2 px-5 py-4 sm:px-6">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2.5 px-5 py-4 sm:px-6">
          <Skeleton className="h-3 w-44" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-6 w-44 rounded-xl" />
            ))}
          </div>
        </div>
      </div>

      {/* Metric cards. The first stands in for the forest hero. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="metric-card-primary">
          <Skeleton className="h-3 w-36 bg-white/25" />
          <Skeleton className="h-9 w-24 bg-white/25" />
          <Skeleton className="h-3 w-40 bg-white/25" />
        </div>
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="metric-card">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-3 w-44" />
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="soft-card flex flex-col gap-4 p-5">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-64" />
            <Skeleton className="h-56 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
