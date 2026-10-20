import { CheckCircle2Icon, CircleDashedIcon, CircleDotIcon, TriangleAlertIcon } from 'lucide-react';

import { cn } from '@/shared/utils';
import type { SectionProgress } from '../internal/progress';

/**
 * The state of a Setup / Activity / Closure section as an icon: done (or
 * confirmed not applicable), in progress, needing attention, or not started.
 * Decorative; the label beside it carries the state in words.
 */
export function SectionStateIcon({ section, className }: { section: Pick<SectionProgress, 'state' | 'isComplete'>; className?: string }) {
  if (section.state === 'complete' || (section.state === 'not_applicable' && section.isComplete)) {
    return <CheckCircle2Icon className={cn('text-success-strong', className)} aria-hidden="true" />;
  }
  if (section.state === 'invalid') return <TriangleAlertIcon className={cn('text-danger', className)} aria-hidden="true" />;
  if (section.state === 'partial') return <CircleDotIcon className={cn('text-primary', className)} aria-hidden="true" />;
  return <CircleDashedIcon className={cn('text-muted-foreground', className)} aria-hidden="true" />;
}
