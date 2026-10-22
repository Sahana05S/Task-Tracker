import { MissionPage } from '@/shared/ui/mission-ui';
import { Skeleton } from '@/shared/ui/skeleton';
import { cn } from '@/shared/utils';

/**
 * Route loading state in the real page container: a title block, an optional
 * row of figure tiles and the page's main panels, so content lands in place
 * instead of pushing the page when it arrives.
 */
export function PageSkeleton({
  label,
  wide = false,
  tiles = 0,
  panels = ['h-80'],
  panelColumns = 1,
}: {
  /** Announced to assistive technology while the page loads. */
  label: string;
  wide?: boolean;
  tiles?: number;
  /** Height utility per main panel. */
  panels?: readonly string[];
  panelColumns?: 1 | 2;
}) {
  return (
    <MissionPage wide={wide}>
      <span role="status" className="sr-only">{label}</span>
      <div className="grid gap-2" aria-hidden="true">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-full max-w-80" />
      </div>
      {tiles ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5" aria-hidden="true">
          {Array.from({ length: tiles }, (_, index) => <Skeleton key={index} className="h-24 rounded-2xl" />)}
        </div>
      ) : null}
      <div className={cn('grid gap-5', panelColumns === 2 && 'xl:grid-cols-2')} aria-hidden="true">
        {panels.map((height, index) => <Skeleton key={index} className={cn('w-full rounded-2xl', height)} />)}
      </div>
    </MissionPage>
  );
}
