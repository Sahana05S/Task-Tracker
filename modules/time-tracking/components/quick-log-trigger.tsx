'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { ClockPlusIcon } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/utils';

// Loaded on first open: the trigger sits on every workspace page.
const QuickLogDrawer = dynamic(() => import('@/modules/time-tracking/components/quick-log-drawer').then((m) => m.QuickLogDrawer), { ssr: false });

export interface QuickLogTriggerProps {
  /** Preselects the drawer's task picker, e.g. from a mission page. */
  presetTaskId?: string;
  /** Button text; stays the accessible name when `iconOnlyBelowLg` hides it. */
  label?: string;
  /** Show only the icon from `md` to `lg`, where the top bar is tight. */
  iconOnlyBelowLg?: boolean;
  className?: string;
}

/**
 * "Log time": opens the manual effort entry (hours, date, progress, notes).
 * The phone bar opens the same drawer from its + menu. The drawer is mounted
 * only while open, so no page pays for the form or its task fetch until
 * someone asks for it.
 */
export function QuickLogTrigger({ presetTaskId, label = 'Log time', iconOnlyBelowLg = false, className }: QuickLogTriggerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button type="button" variant="accent" shape="pill" onClick={() => setOpen(true)} className={cn('font-semibold', className)}>
        <ClockPlusIcon aria-hidden="true" />
        <span className={cn(iconOnlyBelowLg && 'md:max-lg:sr-only')}>{label}</span>
      </Button>
      {open ? <QuickLogDrawer open={open} onOpenChange={setOpen} presetTaskId={presetTaskId} /> : null}
    </>
  );
}
