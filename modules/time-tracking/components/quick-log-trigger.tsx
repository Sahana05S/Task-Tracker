'use client';

import * as React from 'react';
import { PlusIcon } from 'lucide-react';

import { QuickLogDrawer } from '@/modules/time-tracking/components/quick-log-drawer';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/utils';

export interface QuickLogTriggerProps {
  /** Preselects the drawer's task picker, e.g. from a task card. */
  presetTaskId?: string;
  /**
   * `fab` is the raised circular action in the mobile bottom bar.
   * `button` is the inline "Quick Log" control on task cards.
   */
  variant?: 'fab' | 'button';
  /** Label for the `button` variant. */
  label?: string;
  className?: string;
}

/**
 * Opens the effort logger.
 *
 * Both presentations render a real `<button>`, so each is focusable and
 * announced correctly. The drawer is mounted only while open, so neither pays
 * for the form or its task fetch until someone asks for it.
 */
export function QuickLogTrigger({
  presetTaskId,
  variant = 'fab',
  label = 'Quick Log',
  className,
}: QuickLogTriggerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      {variant === 'fab' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Log hours"
          className={cn(
            'bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:ring-ring -mt-6 flex size-14 items-center justify-center rounded-full shadow-(--shadow-soft-lg) transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
            className,
          )}
        >
          <PlusIcon className="size-6" aria-hidden="true" />
        </button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className={className}
        >
          {label}
        </Button>
      )}

      {open ? (
        <QuickLogDrawer
          open={open}
          onOpenChange={setOpen}
          presetTaskId={presetTaskId}
        />
      ) : null}
    </>
  );
}
