import * as React from 'react';

import { cn } from '@/shared/utils';

/**
 * The platform `<select>` with the shared `.field` look and chevron. Use it
 * for forms that post plain values; the Radix `Select` stays for filters and
 * inline cells that need a styled list.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return <select data-slot="native-select" className={cn('field w-full', className)} {...props} />;
}

export { NativeSelect };
