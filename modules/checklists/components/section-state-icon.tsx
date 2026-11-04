import { CheckCircle2Icon, CircleAlertIcon, CircleDashedIcon, CircleDotIcon, TriangleAlertIcon } from 'lucide-react';

import { cn } from '@/shared/utils';
import type { SectionProgress } from '../internal/progress';

/**
 * The state of a Setup / Activity / Closure section as an icon: done (or
 * confirmed not applicable), changes needed (an objective was sent back), in
 * progress (something is done), needing attention, or not started (0%).
 * Decorative; the label beside it carries the state in words.
 */
export function SectionStateIcon({ section, changesNeeded = false, className }: { section: Pick<SectionProgress, 'state' | 'isComplete' | 'progressPercentage'>; changesNeeded?: boolean; className?: string }) {
  if (section.state === 'complete' || (section.state === 'not_applicable' && section.isComplete)) {
    return <CheckCircle2Icon className={cn('text-success-strong', className)} aria-hidden="true" />;
  }
  if (section.state === 'invalid') return <TriangleAlertIcon className={cn('text-danger', className)} aria-hidden="true" />;
  if (section.state === 'partial' && changesNeeded) return <CircleAlertIcon className={cn('text-danger', className)} aria-hidden="true" />;
  if (section.state === 'partial' && (section.progressPercentage ?? 0) > 0) return <CircleDotIcon className={cn('text-primary', className)} aria-hidden="true" />;
  return <CircleDashedIcon className={cn('text-muted-foreground', className)} aria-hidden="true" />;
}
