import { Skeleton } from '@/shared/ui/skeleton';

/**
 * Log history loading state.
 *
 * Mirrors the date-grouped timeline: a heading row with its hour subtotal, then
 * the entry cards beneath it, repeated for two days.
 */
export default function LogsLoading() {
  return (
    <div className="flex flex-col gap-4">
      <span role="status" className="sr-only">
        Loading effort log
      </span>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-8 w-28 rounded-full" />
      </div>

      {/* Two date groups */}
      {Array.from({ length: 2 }).map((_, group) => (
        <div key={group} className="flex flex-col gap-3">
          <div className="flex items-center gap-3 py-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-12 rounded-full" />
            <span className="bg-border h-px flex-1" aria-hidden="true" />
          </div>

          <ul className="flex flex-col gap-3">
            {Array.from({ length: group === 0 ? 2 : 1 }).map((_, entry) => (
              <li key={entry} className="soft-card flex flex-col gap-2 px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-5 w-10 rounded-full" />
                  <span className="ml-auto flex items-center gap-1.5">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-12 rounded-full" />
                  </span>
                </div>

                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />

                <div className="flex gap-1.5">
                  <Skeleton className="h-5 w-40 rounded-full" />
                  <Skeleton className="h-5 w-32 rounded-full" />
                </div>

                <div className="border-border flex items-center gap-1 border-t pt-2.5">
                  <Skeleton className="h-7 w-16 rounded-full" />
                  <Skeleton className="h-7 w-20 rounded-full" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
