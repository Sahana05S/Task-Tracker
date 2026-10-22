'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import Link from 'next/link';
import { CircleHelpIcon } from 'lucide-react';

import { GLOSSARY, guideHref, type GlossaryKey } from '@/shared/tracker/glossary';
import { cn } from '@/shared/utils';

/** The open tip: the term, one sentence and a link to the guide. */
export function HelpTipBody({ tip }: { tip: GlossaryKey }) {
  const entry = GLOSSARY[tip];
  return (
    <>
      <p className="text-foreground font-semibold">{entry.term}</p>
      <p className="text-muted-foreground mt-1 text-pretty">{entry.meaning}</p>
      <Link href={guideHref(entry)} className="link mt-2 inline-block font-medium">Learn more</Link>
    </>
  );
}

/**
 * A small "?" beside a glossary term. It is a real button, so Tab reaches it
 * and Enter or Space opens it; Escape closes it and returns focus to the
 * button, and Tab moves into the tip to reach "Learn more". The term stays in
 * the text; the button only explains it.
 */
export function HelpTip({ tip, className }: { tip: GlossaryKey; className?: string }) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        type="button"
        aria-label={`What is “${GLOSSARY[tip].term}”?`}
        className={cn(
          // 24px visible target inside a 32px hit area; inline with text.
          'text-muted-foreground hover:text-primary focus-visible:outline-primary relative inline-grid size-6 shrink-0 place-items-center rounded-full align-middle',
          'before:absolute before:-inset-1 before:content-[""] data-[state=open]:text-primary',
          className,
        )}
      >
        <CircleHelpIcon className="size-4" aria-hidden="true" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="top"
          sideOffset={6}
          collisionPadding={16}
          className={cn(
            'border-border bg-popover text-popover-foreground shadow-soft-lg z-50 w-72 max-w-[calc(100vw-2rem)] rounded-xl border p-3.5 text-sm leading-relaxed',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
          )}
        >
          <HelpTipBody tip={tip} />
          <PopoverPrimitive.Arrow className="fill-popover" width={12} height={6} />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
