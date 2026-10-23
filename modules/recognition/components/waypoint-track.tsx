import { CheckIcon } from 'lucide-react';

import { DEFAULT_WAYPOINTS, waypointState, type Waypoint } from '@/modules/recognition/client';
import { cn } from '@/shared/utils';

export type WaypointTrackVariant = 'full' | 'compact' | 'cell';

/**
 * A mission's waypoints (Ignition 30% ... Landing 100%) as dots on a ruler
 * that lines up with the progress bar above it: reached in mint, the next one
 * ringed in violet. Server-safe (no hooks), so cards, the table and the mission
 * page all render it.
 *
 * - `full` (mission overview): ruler, reached names and the next waypoint.
 * - `compact` (cards): ruler and one "Next:" line, no labels on the ruler.
 * - `cell` (table): five small dots and the furthest waypoint reached.
 *
 * Reached = stored first crossings plus what current progress covers, so a
 * mission whose progress drops keeps the waypoints it passed; those now above
 * current progress show hollow, as earned earlier. `stopped`
 * (discarded or archived) drops the "Next" prompt.
 */
export function WaypointTrack({
  progress,
  reachedKeys,
  waypoints = DEFAULT_WAYPOINTS,
  taskTag,
  variant,
  stopped = false,
}: {
  progress: number | null;
  /** Stored first crossings (keys). */
  reachedKeys?: readonly string[];
  waypoints?: readonly Waypoint[];
  taskTag: string;
  variant: WaypointTrackVariant;
  stopped?: boolean;
}) {
  const { reached, next } = waypointState(progress, reachedKeys, waypoints);
  const done = new Set(reached.map((w) => w.key));
  const furthest = reached.at(-1) ?? null;
  const above = (w: Waypoint) => progress !== null && w.percent > progress;
  const earlier = reached.filter(above);
  const stateOf = (w: Waypoint): DotState =>
    done.has(w.key) ? (above(w) ? 'earlier' : 'reached') : !stopped && next?.key === w.key ? 'next' : 'ahead';
  const summary = (
    <ol className="sr-only">
      {waypoints.map((w) => (
        <li key={w.key}>
          {w.label}, {w.percent}%: {done.has(w.key) ? 'reached' : 'not reached'}
        </li>
      ))}
    </ol>
  );

  if (variant === 'cell') {
    return (
      <div role="group" aria-label={`Waypoints for ${taskTag}`} className="flex items-center gap-2">
        <span aria-hidden="true" className="flex shrink-0 items-center gap-0.5">
          {waypoints.map((w) => (
            <Dot key={w.key} state={stateOf(w)} size="xs" />
          ))}
        </span>
        <span aria-hidden="true" title={furthest?.label} className={cn('min-w-0 truncate text-xs', furthest ? 'text-foreground font-medium' : 'text-muted-foreground')}>
          {furthest ? furthest.label : 'Not yet'}
        </span>
        {summary}
      </div>
    );
  }

  const nextLine = stopped || !next ? null : (
    <>
      Next: <span className="text-foreground font-semibold">{next.label}</span> at {next.percent}%
    </>
  );

  return (
    <div role="group" aria-label={`Waypoints for ${taskTag}`} className="flex flex-col gap-1.5">
      <div aria-hidden="true" className="relative h-3">
        {waypoints.map((w) => (
          <span
            key={w.key}
            className={cn('absolute top-1/2 -translate-y-1/2', w.percent >= 100 ? '-translate-x-full' : '-translate-x-1/2')}
            style={{ left: `${Math.min(100, w.percent)}%` }}
          >
            <Dot state={stateOf(w)} size="sm" />
          </span>
        ))}
      </div>
      {summary}
      {variant === 'full' ? (
        <p className="text-muted-foreground text-xs leading-relaxed">
          {furthest ? (
            <>
              Reached{' '}
              <span className="text-foreground font-semibold">
                {reached.map((w) => w.label).join(' · ')}
              </span>
              {nextLine ? '. ' : '.'}
            </>
          ) : null}
          {earlier.length ? (
            <span className="block">
              Progress has dropped below {earlier.map((w) => w.label).join(' and ')} since; reached waypoints stay earned.
            </span>
          ) : null}
          {nextLine}
          {!furthest && !nextLine ? 'No waypoints reached.' : null}
          <span className="block">Waypoints follow overall progress.</span>
        </p>
      ) : (
        <p className="text-muted-foreground text-xs">
          {nextLine ?? (next ? `${reached.length} of ${waypoints.length} waypoints` : (
            <span className="text-success-strong inline-flex items-center gap-1 font-semibold">
              <CheckIcon className="size-3.5" aria-hidden="true" />
              {furthest?.label ?? 'Landing'} reached
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

type DotState = 'reached' | 'earlier' | 'next' | 'ahead';

function Dot({ state, size }: { state: DotState; size: 'xs' | 'sm' }) {
  return (
    <span
      className={cn(
        'block rounded-full',
        size === 'xs' ? 'size-1.5' : 'size-2.5',
        state === 'reached' && (size === 'xs' ? 'bg-success' : 'bg-success ring-card ring-2'),
        state === 'earlier' && (size === 'xs' ? 'border-success border' : 'bg-card border-success border-2'),
        state === 'next' && (size === 'xs' ? 'bg-primary' : 'bg-card border-primary border-2'),
        state === 'ahead' && (size === 'xs' ? 'bg-muted-foreground/45' : 'bg-card border-muted-foreground/60 border-[1.5px]'),
      )}
    />
  );
}
