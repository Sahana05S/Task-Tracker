import * as React from 'react';

import { cn } from '@/shared/utils';

/**
 * Multi-line field with the shared `.field` look. `field-sizing-content` lets
 * the box grow with what is typed, which matters for the statement editors
 * where the content is paragraphs rather than a line.
 */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn('field flex min-h-16 w-full field-sizing-content', className)}
      {...props}
    />
  );
}

export { Textarea };
