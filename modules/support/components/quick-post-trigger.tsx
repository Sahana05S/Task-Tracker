'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { MessageSquarePlusIcon } from 'lucide-react';

import type { RecordKind } from '@/modules/support/internal/contract';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/utils';

// Loaded on first open: the trigger sits on every workspace page.
const QuickPostDrawer = dynamic(() => import('@/modules/support/components/quick-post-drawer').then((m) => m.QuickPostDrawer), { ssr: false });

export interface QuickPostTriggerProps {
  /** Opens on this kind (a Records tab) instead of the last one used. */
  presetKind?: RecordKind;
  /** Preselects the related task (a mission page or card menu). */
  presetTaskId?: string;
  /** Button text; stays the accessible name when `iconOnlyBelowLg` hides it. */
  label?: string;
  /** Show only the icon from `md` to `lg`, where the top bar is tight. */
  iconOnlyBelowLg?: boolean;
  className?: string;
}

/**
 * Opens the quick Post drawer. The drawer is mounted only while open, so no
 * page pays for its member and mission read until someone asks to post.
 * "Post another" in the success toast reopens it; the drawer opens on the
 * kind just posted (remembered on the device) unless `presetKind` is set.
 */
export function QuickPostTrigger({ presetKind, presetTaskId, label = 'Post', iconOnlyBelowLg = false, className }: QuickPostTriggerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        shape="pill"
        onClick={() => setOpen(true)}
        className={cn('font-semibold', className)}
      >
        <MessageSquarePlusIcon aria-hidden="true" />
        <span className={cn(iconOnlyBelowLg && 'md:max-lg:sr-only')}>{label}</span>
      </Button>
      {open ? (
        <QuickPostDrawer
          open={open}
          onOpenChange={setOpen}
          presetKind={presetKind}
          presetTaskId={presetTaskId}
          onPostAnother={() => setOpen(true)}
        />
      ) : null}
    </>
  );
}
