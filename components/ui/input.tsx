import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Sheet-faithful field: white cell on a subtle slate border.
        'flex h-9 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm text-slate-900 shadow-xs transition-colors outline-none',
        'placeholder:text-slate-400',
        'selection:bg-sky-100 selection:text-sky-900',
        'focus-visible:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-500/30',
        'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
        'aria-invalid:border-rose-300 aria-invalid:ring-2 aria-invalid:ring-rose-500/20',
        'file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
