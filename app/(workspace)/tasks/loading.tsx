import { Skeleton } from '@/components/ui/skeleton';

/** Column widths, shared by the grid header and its rows so they line up. */
const GRID_COLUMNS = [
  'w-16',
  'w-48',
  'w-10',
  'w-24',
  'w-16',
  'w-20',
  'w-20',
  'w-12',
  'w-16',
  'w-12',
] as const;

/**
 * Task route loading state.
 *
 * Mirrors the real layout: header row, filter bar, then the grid at `lg` and the
 * card stack below it. Matching both the shape and the card treatment means the
 * content lands in place rather than pushing the page around when it arrives.
 *
 * The placeholders are `aria-hidden`; the status region below is what assistive
 * technology announces.
 */
export default function TasksLoading() {
  return (
    <div className="flex flex-col gap-4">
      <span role="status" className="sr-only">
        Loading tasks
      </span>

      {/* Header */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-60" />
        </div>
        <Skeleton className="h-10 w-32 rounded-full" />
      </div>

      {/* Filter bar */}
      <div className="soft-card flex flex-col gap-2.5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 min-w-52 flex-1 rounded-xl" />
          <Skeleton className="h-9 w-40 rounded-xl" />
          <Skeleton className="h-9 w-44 rounded-xl" />
          <Skeleton className="h-9 w-32 rounded-xl" />
          <Skeleton className="h-9 w-36 rounded-xl" />
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>
        <Skeleton className="h-3 w-20" />
      </div>

      {/* Grid, desktop */}
      <div className="soft-card-clip hidden lg:block">
        <div className="border-border flex items-center gap-4 border-b bg-[#fbfcfd] px-4 py-3">
          {GRID_COLUMNS.map((width, index) => (
            <Skeleton key={index} className={`h-3 ${width}`} />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, row) => (
          <div
            key={row}
            className="border-border flex items-center gap-4 border-b px-4 py-3.5 last:border-b-0"
          >
            {GRID_COLUMNS.map((width, index) => (
              <Skeleton key={index} className={`h-3.5 ${width}`} />
            ))}
          </div>
        ))}
      </div>

      {/* Cards, mobile and tablet */}
      <ul className="flex flex-col gap-3 lg:hidden">
        {Array.from({ length: 5 }).map((_, index) => (
          <li key={index} className="soft-card flex flex-col">
            <div className="border-border flex items-center gap-2 border-b px-4 py-2.5">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-5 w-10 rounded-full" />
              <Skeleton className="ml-auto h-3.5 w-16" />
            </div>
            <div className="flex flex-col gap-2.5 px-4 py-3">
              <Skeleton className="h-4 w-3/4" />
              <div className="flex items-center gap-2">
                <Skeleton className="size-5 rounded-full" />
                <Skeleton className="h-3 w-28" />
                <Skeleton className="ml-auto h-5 w-16 rounded-full" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-2 flex-1 rounded-full" />
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
            </div>
            <div className="border-border flex items-center gap-2 border-t px-4 py-2.5">
              <Skeleton className="h-7 w-28 rounded-full" />
              <Skeleton className="ml-auto h-8 w-24 rounded-full" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
