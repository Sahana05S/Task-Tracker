import * as React from 'react';

import { cn } from '@/shared/utils';

/**
 * Single-line field. The control look lives once, in `.field` (globals.css),
 * so this input, `Textarea`, `NativeSelect` and older forms that use the class
 * directly all render the same box, focus ring and error state.
 */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'field flex w-full',
        'file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
