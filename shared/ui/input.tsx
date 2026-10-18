import * as React from 'react';

import { cn } from '@/shared/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Recessed field on a card: soft fill, hairline edge, generous corner.
        'border-input text-foreground flex h-10 w-full min-w-0 rounded-xl border bg-white px-3.5 py-1 text-sm transition-colors outline-none',
        'placeholder:text-slate-400',
        'selection:bg-primary-subtle selection:text-primary',
        'focus-visible:border-primary focus-visible:ring-primary/20 focus-visible:ring-2',
        'disabled:bg-muted disabled:cursor-not-allowed disabled:text-slate-400',
        'aria-invalid:border-rose-300 aria-invalid:ring-2 aria-invalid:ring-rose-500/20',
        'file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
