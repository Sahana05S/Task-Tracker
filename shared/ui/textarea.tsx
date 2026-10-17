import * as React from 'react';

import { cn } from '@/shared/utils';

/**
 * Multi-line field. Deliberately styled to match `Input` exactly — same border
 * token, same corner, same forest focus ring — so a form that mixes the two does
 * not look like it was assembled from two different kits.
 *
 * `field-sizing-content` lets the box grow with what is typed, which matters for
 * the statement editors where the content is paragraphs rather than a line.
 */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-input text-foreground flex min-h-16 w-full rounded-xl border bg-white px-3.5 py-2 text-sm transition-colors outline-none',
        'field-sizing-content',
        'placeholder:text-slate-400',
        'selection:bg-primary-subtle selection:text-primary',
        'focus-visible:border-primary focus-visible:ring-primary/20 focus-visible:ring-2',
        'disabled:bg-muted disabled:cursor-not-allowed disabled:text-slate-400',
        'aria-invalid:border-rose-300 aria-invalid:ring-2 aria-invalid:ring-rose-500/20',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
