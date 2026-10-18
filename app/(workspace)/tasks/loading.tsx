import { Skeleton } from '@/shared/ui/skeleton';

/**
 * Missions loading state.
 *
 * Mirrors the real layout: header, toolbar, then the mission card grid. Matching
 * the shape means the content lands in place rather than pushing the page
 * around when it arrives.
 *
 * The placeholders are `aria-hidden`; the status region below is what assistive
 * technology announces.
 */
export default function TasksLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 pt-6 pb-10 lg:px-6">
      <span role="status" className="sr-only">
        Loading missions
      </span>

      {/* Header */}
      <div className="flex items-end justify-between gap-3" aria-hidden="true">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-36 rounded-xl" />
      </div>

      {/* Toolbar */}
      <div className="soft-card flex flex-col gap-3 p-4" aria-hidden="true">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 min-w-52 flex-1 rounded-xl lg:max-w-80" />
          <Skeleton className="h-8 w-16 rounded-xl" />
          <Skeleton className="h-8 w-28 rounded-xl" />
          <Skeleton className="h-8 w-28 rounded-xl" />
          <Skeleton className="h-8 w-20 rounded-xl" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-40 rounded-xl" />
          <Skeleton className="h-8 w-44 rounded-xl" />
          <Skeleton className="h-8 w-32 rounded-xl" />
          <Skeleton className="h-8 w-36 rounded-xl" />
        </div>
      </div>

      {/* Cards */}
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, index) => (
          <li key={index} className="soft-card flex flex-col gap-4 p-5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-10 rounded-full" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
            <div className="border-border flex flex-col gap-3 border-t pt-4">
              <Skeleton className="h-8 w-40 rounded-full" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-28 rounded-xl" />
                <Skeleton className="ml-auto h-8 w-24 rounded-xl" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
