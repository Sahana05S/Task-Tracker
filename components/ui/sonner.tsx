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
            'group rounded-lg border border-slate-200 bg-white text-slate-900 shadow-md',
          title: 'text-sm font-medium',
          description: 'text-sm text-slate-500',
          actionButton:
            'rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-slate-50',
          cancelButton:
            'rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700',
          closeButton: 'border-slate-200 bg-white text-slate-500',
          success: 'border-emerald-200 [&_[data-icon]]:text-emerald-600',
          error: 'border-rose-200 [&_[data-icon]]:text-rose-600',
          warning: 'border-amber-200 [&_[data-icon]]:text-amber-600',
          info: 'border-sky-200 [&_[data-icon]]:text-sky-600',
        },
      }}
    />
  );
}
