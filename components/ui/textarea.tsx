import * as React from 'react';

import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-16 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs transition-colors outline-none',
        'field-sizing-content',
        'placeholder:text-slate-400',
        'focus-visible:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-500/30',
        'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
        'aria-invalid:border-rose-300 aria-invalid:ring-2 aria-invalid:ring-rose-500/20',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
