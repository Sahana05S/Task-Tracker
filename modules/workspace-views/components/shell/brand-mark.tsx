import { cn } from '@/shared/utils';

/**
 * The existing TaskPulse "TP" mark, reused unchanged in form for this phase.
 * A permanent logo (and the Orbit mascot) are separate work; nothing here
 * traces or replaces the Stitch PNG.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold',
        className,
      )}
    >
      TP
    </span>
  );
}
