import { Skeleton } from '@/components/ui/skeleton';

/**
 * Task route loading state.
 *
 * Mirrors the real layout: header row, filter bar, then the grid at `lg` and the
 * card stack below it. Matching the shape means the content lands in place rather
 * than pushing the page around when it arrives.
 *
 * The placeholders are `aria-hidden`; the status region below is what assistive
 * technology announces.
 */
export default function TasksLoading() {
  return (
    <div className="flex flex-col gap-3">
      <span role="status" className="sr-only">
        Loading tasks
      </span>

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-56" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 min-w-52 flex-1" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-8 w-32" />
        </div>
        <Skeleton className="h-3 w-20" />
      </div>

      {/* Grid, desktop */}
      <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white lg:block">
        <div className="flex items-center gap-4 border-b border-slate-200 bg-slate-100 px-3 py-2.5">
          {['w-16', 'w-48', 'w-10', 'w-24', 'w-16', 'w-20', 'w-20', 'w-12', 'w-16', 'w-12'].map(
            (width, index) => (
              <Skeleton key={index} className={`h-3 ${width}`} />
            ),
          )}
        </div>
        {Array.from({ length: 8 }).map((_, row) => (
          <div
            key={row}
            className="flex items-center gap-4 border-b border-slate-200 px-3 py-3"
          >
            {['w-16', 'w-48', 'w-10', 'w-24', 'w-16', 'w-20', 'w-20', 'w-12', 'w-16', 'w-12'].map(
              (width, index) => (
                <Skeleton key={index} className={`h-3.5 ${width}`} />
              ),
            )}
          </div>
        ))}
      </div>

      {/* Cards, mobile and tablet */}
      <ul className="flex flex-col gap-2 lg:hidden">
        {Array.from({ length: 5 }).map((_, index) => (
          <li
            key={index}
            className="flex flex-col rounded-lg border border-slate-200 bg-white"
          >
            <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="ml-auto h-3.5 w-16" />
            </div>
            <div className="flex flex-col gap-2.5 px-3 py-3">
              <Skeleton className="h-4 w-3/4" />
              <div className="flex items-center gap-2">
                <Skeleton className="size-5 rounded-full" />
                <Skeleton className="h-3 w-28" />
                <Skeleton className="ml-auto h-4 w-16" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-1.5 flex-1 rounded-full" />
                <Skeleton className="h-4 w-10" />
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-slate-200 px-3 py-2">
              <Skeleton className="h-7 w-28" />
              <Skeleton className="ml-auto h-8 w-24" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
