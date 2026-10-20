import { cn } from '@/shared/utils';

/**
 * A figure that cannot be shown: a dash in the cell, with the reason as a
 * tooltip and in the accessible name, instead of the word "Unavailable"
 * crowding a numeric column.
 */
export function UnavailableValue({ reason, className }: { reason?: string; className?: string }) {
  const description = reason ? `Not available: ${reason}` : 'Not available';
  return (
    <span title={description} className={cn('text-muted-foreground', className)}>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{description}</span>
    </span>
  );
}
