import { HistoryIcon } from 'lucide-react';

import { cn } from '@/shared/utils';

/** "23 Oct" for an ISO date (India calendar day, no time). */
export function shortDay(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date.slice(0, 10)}T00:00:00Z`));
}

/**
 * The small grey caption under data that is the latest recorded rather than today's, e.g.
 * "As of 23 Oct" (user decision, 25 October 2026: show the last recorded data, never a
 * "waiting for data" warning). `date` is an ISO day; `label` replaces the default wording.
 */
export function AsOfNote({ date, label, className }: { date?: string; label?: string; className?: string }) {
  const text = label ?? (date ? `As of ${shortDay(date)}` : null);
  if (!text) return null;
  return (
    <p className={cn('text-muted-foreground inline-flex items-center gap-1 text-xs', className)}>
      <HistoryIcon className="size-3" aria-hidden="true" />
      {text}
    </p>
  );
}
