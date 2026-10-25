import { cn } from '@/shared/utils';

/**
 * A figure with no value yet: a quiet dash. It no longer says "Not available"
 * or why (user decision, 25 October 2026: no missing-data warnings on pages).
 * `reason` is kept for callers and ignored.
 */
export function UnavailableValue({ className }: { reason?: string; className?: string }) {
  return (
    <span className={cn('text-muted-foreground', className)}>
      <span aria-hidden="true">—</span>
      <span className="sr-only">No value yet</span>
    </span>
  );
}
