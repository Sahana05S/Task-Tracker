import type { ComponentType } from 'react';
import { MinusIcon, RefreshCwIcon, StarIcon, TreePalmIcon } from 'lucide-react';

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
  // Undecided days look alike and carry no warning (user decision, 25 October 2026).
  waiting: { label: 'No star yet', icon: MinusIcon, tone: 'bg-card text-muted-foreground border-border-strong border-dashed' },
  queued: { label: 'No star yet', icon: MinusIcon, tone: 'bg-card text-muted-foreground border-border-strong border-dashed' },
  failed: { label: 'No star yet', icon: MinusIcon, tone: 'bg-card text-muted-foreground border-border-strong border-dashed' },
};

/** The kinds the key lists, in order; undecided days are plain cells with no key entry. */
export const AWARD_KIND_ORDER: readonly AwardDayKind[] = ['awarded', 'no_winner', 'holiday'];

/**
 * The mark on a day that shows its last decided result while a recheck is
 * queued (`awardDayView(...).recalculating`): an icon and the word, never
 * colour alone.
 */
export const RECALCULATING = {
  label: 'Last decided result',
  icon: RefreshCwIcon as Icon,
  description: 'The last decided result for this day.',
} as const;
