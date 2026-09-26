import { Skeleton } from '@/components/ui/skeleton';

/**
 * Log history loading state.
 *
 * Mirrors the date-grouped timeline: a heading row with its hour subtotal, then
 * the entry cards beneath it, repeated for two days.
 */
export default function LogsLoading() {
  return (
    <div className="flex flex-col gap-3">
      <span role="status" className="sr-only">
        Loading effort log
      </span>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-64" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>

      {/* Two date groups */}
      {Array.from({ length: 2 }).map((_, group) => (
        <div key={group} className="flex flex-col gap-2">
          <div className="flex items-center gap-3 py-1">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-12" />
            <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
          </div>

          <ul className="flex flex-col gap-2">
            {Array.from({ length: group === 0 ? 2 : 1 }).map((_, entry) => (
              <li
                key={entry}
                className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-4 w-10" />
                  <span className="ml-auto flex items-center gap-1.5">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-12" />
                  </span>
                </div>

                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />

                <div className="flex gap-1.5">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-5 w-32" />
                </div>

                <div className="flex items-center gap-1 border-t border-slate-100 pt-2">
                  <Skeleton className="h-7 w-16" />
                  <Skeleton className="h-7 w-20" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
