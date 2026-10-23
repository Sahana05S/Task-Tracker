import type { ComponentType } from 'react';
import { ClockIcon, HourglassIcon, MinusIcon, RefreshCwIcon, StarIcon, TreePalmIcon, TriangleAlertIcon } from 'lucide-react';

import type { AwardDayKind } from '@/modules/scoring/client';

type Icon = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;

/**
 * One icon, word and colour per day kind for the award month strip, so a
 * status always looks the same. Colour never carries the meaning alone:
 * every use pairs it with the icon and the word.
 */
export const AWARD_KIND: Record<AwardDayKind, { label: string; icon: Icon; tone: string }> = {
  awarded: { label: 'Star awarded', icon: StarIcon, tone: 'bg-recognition-subtle text-recognition-foreground border-recognition/40' },
  no_winner: { label: 'No winner', icon: MinusIcon, tone: 'bg-muted text-muted-foreground border-border' },
  holiday: { label: 'Holiday', icon: TreePalmIcon, tone: 'bg-muted text-muted-foreground border-border' },
  waiting: { label: 'Waiting for data', icon: HourglassIcon, tone: 'bg-attention-subtle text-attention-foreground border-attention-border' },
  queued: { label: 'Not calculated yet', icon: ClockIcon, tone: 'bg-card text-muted-foreground border-border-strong border-dashed' },
  failed: { label: 'Failed', icon: TriangleAlertIcon, tone: 'bg-danger-subtle text-danger-foreground border-danger-border' },
};

/** The order kinds are counted and explained in. */
export const AWARD_KIND_ORDER: readonly AwardDayKind[] = ['awarded', 'no_winner', 'waiting', 'queued', 'failed', 'holiday'];

/**
 * The mark on a day that shows its last decided result while a recheck is
 * queued (`awardDayView(...).recalculating`): an icon and the word, never
 * colour alone.
 */
export const RECALCULATING = {
  label: 'Recalculating',
  icon: RefreshCwIcon as Icon,
  description: 'Records changed after this result; it is shown until the recheck finishes.',
} as const;
