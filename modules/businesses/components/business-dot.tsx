import { BUSINESS_DOT_CLASS, type Business } from '@/modules/businesses/client';
import { cn } from '@/shared/utils';

/**
 * A mission's business as a small coloured dot (cards, rows, the details sheet). Named for screen
 * readers and on hover. Renders nothing for a mission with no business. Safe in server and client components.
 */
export function BusinessDot({ business, className, showName = false }: {
  business: Pick<Business, 'name' | 'colour' | 'archived'> | null | undefined;
  className?: string;
  /** Show the name beside the dot (detail views); otherwise it is only announced. */
  showName?: boolean;
}) {
  if (!business) return null;
  const label = `${business.name}${business.archived ? ' (archived)' : ''}`;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)} title={showName ? undefined : `Business: ${label}`}>
      <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', BUSINESS_DOT_CLASS[business.colour], business.archived && 'opacity-60')} />
      {showName ? <span className="truncate">{label}</span> : <span className="sr-only">Business: {label}</span>}
    </span>
  );
}
