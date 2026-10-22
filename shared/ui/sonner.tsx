'use client';

import { Toaster as SonnerToaster } from 'sonner';

import { useTheme } from '@/shared/ui/theme';

/**
 * Toast host.
 *
 * Mounted once in the root layout, inside the theme provider, so toasts follow
 * the painted Light or Dark theme.
 *
 * Styling is passed through Sonner's `classNames` slots so the toasts inherit the
 * app's tokens (popover surface, hairline border) instead of Sonner's defaults.
 */
export function Toaster() {
  const { resolved } = useTheme();
  return (
    <SonnerToaster
      theme={resolved}
      position="bottom-right"
      // Phones: clear the bottom bar (4.5rem) and its New button.
      mobileOffset={{ bottom: 'calc(var(--spacing-bottom-nav) + 4.5rem)' }}
      closeButton
      // Long enough to read a database error, short enough not to linger.
      duration={5000}
      toastOptions={{
        classNames: {
          toast:
            'group rounded-lg border border-border bg-popover text-popover-foreground shadow-md',
          title: 'text-sm font-medium',
          description: 'text-sm text-muted-foreground',
          actionButton:
            'rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground',
          cancelButton:
            'rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground',
          closeButton: 'border-border bg-popover text-muted-foreground',
          success: 'border-success/30 [&_[data-icon]]:text-success-strong',
          error: 'border-danger-border [&_[data-icon]]:text-danger',
          warning: 'border-attention-border [&_[data-icon]]:text-attention-foreground',
          info: 'border-primary/20 [&_[data-icon]]:text-primary',
        },
      }}
    />
  );
}
