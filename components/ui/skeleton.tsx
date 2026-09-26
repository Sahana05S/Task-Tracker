import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Loading placeholder.
 *
 * `aria-hidden` on every instance: a screen reader should hear the route's
 * loading announcement once, not a stream of empty boxes. The `loading.tsx`
 * boundaries that use these supply the announcement.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-slate-200/70', className)}
      {...props}
    />
  );
}

export { Skeleton };
