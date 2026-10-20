'use client';

import { Toaster as SonnerToaster } from 'sonner';

/**
 * Toast host.
 *
 * Mounted once in the root layout. The theme is pinned to light rather than read
 * from a theme provider: `responsive-ui-design.md` describes a single light
 * workspace and defines no dark equivalents, so there is nothing to switch
 * between.
 *
 * Styling is passed through Sonner's `classNames` slots so the toasts inherit the
 * sheet palette — white surface, slate micro-border — instead of Sonner's
 * defaults.
 */
export function Toaster() {
  return (
    <SonnerToaster
      theme="light"
      position="bottom-right"
      closeButton
      // Long enough to read a database error, short enough not to linger.
      duration={5000}
      toastOptions={{
        classNames: {
          toast:
            'group rounded-lg border border-border bg-white text-foreground shadow-md',
          title: 'text-sm font-medium',
          description: 'text-sm text-muted-foreground',
          actionButton:
            'rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground',
          cancelButton:
            'rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground',
          closeButton: 'border-border bg-white text-muted-foreground',
          success: 'border-success/30 [&_[data-icon]]:text-success-strong',
          error: 'border-danger-border [&_[data-icon]]:text-danger',
          warning: 'border-amber-200 [&_[data-icon]]:text-amber-600',
          info: 'border-primary/20 [&_[data-icon]]:text-primary',
        },
      }}
    />
  );
}
