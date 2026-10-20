'use client';

import * as React from 'react';

import { Button } from '@/shared/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/shared/ui/sheet';

/** A small button that opens a side sheet holding server-rendered content. */
export function ChecklistSheetButton({
  label,
  title,
  description,
  children,
}: {
  label: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="rounded-xl">{label}</Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="pr-12">
          <SheetTitle className="text-foreground text-lg font-bold tracking-tight">{title}</SheetTitle>
          {description ? <SheetDescription className="text-muted-foreground">{description}</SheetDescription> : null}
        </SheetHeader>
        <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-5 py-5">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
