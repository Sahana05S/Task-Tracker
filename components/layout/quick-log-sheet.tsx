'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRightIcon, PlusIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

/**
 * The centred "Log Hours (+)" action in the mobile bottom bar.
 *
 * Opens a bottom drawer, which is where the daily effort form lands in Phase 4
 * (`daily_task_logs`). Until then the drawer offers the path to the existing log
 * history so the control is never a dead end.
 */
export function QuickLogSheet() {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Log hours"
        className="-mt-6 flex size-14 items-center justify-center rounded-full bg-slate-900 text-slate-50 shadow-lg transition-colors hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-sky-500/50 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <PlusIcon className="size-6" aria-hidden="true" />
      </SheetTrigger>

      <SheetContent side="bottom" className="pb-8">
        <SheetHeader>
          <SheetTitle>Log hours</SheetTitle>
          <SheetDescription>
            Record time and progress against one of your tasks.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 px-4">
          <p className="text-sm text-slate-500">
            The quick entry form arrives with the daily effort logger in Phase 4.
          </p>

          <Button asChild variant="outline" className="w-full">
            <Link href="/logs" onClick={() => setOpen(false)}>
              View log history
              <ArrowRightIcon aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
