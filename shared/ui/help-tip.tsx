'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import Link from 'next/link';
import { CircleHelpIcon } from 'lucide-react';

import { GLOSSARY, guideHref, type GlossaryKey } from '@/shared/tracker/labels';
import { cn } from '@/shared/utils';

export interface HelpTipContent {
  readonly term: string;
  readonly meaning: string;
  /** "Learn more" target; omitted for a tip with nothing more to say. */
  readonly href?: string;
}

/** What a tip says: a glossary term, or words written at the call site. */
export function helpTipContent(tip: GlossaryKey | HelpTipContent): HelpTipContent {
  if (typeof tip !== 'string') return tip;
  const entry = GLOSSARY[tip];
  return { term: entry.term, meaning: entry.meaning, href: guideHref(entry) };
}

/** The open tip: the term, one sentence and a link to the guide. */
export function HelpTipBody({ content }: { content: HelpTipContent }) {
  return (
    <>
      <p className="text-foreground font-semibold">{content.term}</p>
      <p className="text-muted-foreground mt-1 text-pretty">{content.meaning}</p>
      {content.href ? <Link href={content.href} className="link mt-2 inline-block font-medium">Learn more</Link> : null}
    </>
  );
}

/**
 * A small "?" beside a term. It is a real button, so Tab reaches it and Enter
 * or Space opens it; Escape closes it and returns focus to the button, and Tab
 * moves into the tip to reach "Learn more". The tip never hides the term: the
 * term stays in the text, the button only explains it.
 */
export function HelpTip({ tip, className, side = 'top' }: {
  tip: GlossaryKey | HelpTipContent;
  className?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  const content = helpTipContent(tip);
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        type="button"
        aria-label={`What is “${content.term}”?`}
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
          side={side}
          sideOffset={6}
          collisionPadding={16}
          className={cn(
            'border-border bg-popover text-popover-foreground shadow-soft-lg z-50 w-72 max-w-[calc(100vw-2rem)] rounded-xl border p-3.5 text-sm leading-relaxed',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
          )}
        >
          <HelpTipBody content={content} />
          <PopoverPrimitive.Arrow className="fill-popover" width={12} height={6} />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/** A term followed by its tip, kept on one line. */
export function TermWithTip({ tip, children, className }: { tip: GlossaryKey | HelpTipContent; children?: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5 whitespace-nowrap', className)}>
      {children ?? helpTipContent(tip).term}
      <HelpTip tip={tip} />
    </span>
  );
}
