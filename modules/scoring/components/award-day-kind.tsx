import type { ComponentType } from 'react';
import {
  CalendarXIcon,
  ClockIcon,
  DatabaseIcon,
  EqualIcon,
  HistoryIcon,
  HourglassIcon,
  InfoIcon,
  MinusIcon,
  ReceiptIcon,
  RefreshCwIcon,
  ScaleIcon,
  StarIcon,
  TreePalmIcon,
  TriangleAlertIcon,
  UsersIcon,
  UserXIcon,
} from 'lucide-react';

import type { AwardDayKind, ReasonChip, ReasonChipKey } from '@/modules/scoring/client';
import { codeLabel } from '@/shared/tracker/labels';
import { cn } from '@/shared/utils';

type Icon = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;

/**
 * One icon, word and colour per day kind, shared by the month strip and the
 * day-by-day table so a status always looks the same. Colour never carries
 * the meaning alone: every use pairs it with the icon and the word.
 */
export const AWARD_KIND: Record<AwardDayKind, { label: string; icon: Icon; tone: string }> = {
  awarded: { label: 'Star awarded', icon: StarIcon, tone: 'bg-recognition-subtle text-recognition-foreground border-recognition/40' },
  no_winner: { label: 'No winner', icon: MinusIcon, tone: 'bg-muted text-muted-foreground border-border' },
  holiday: { label: 'Holiday', icon: TreePalmIcon, tone: 'bg-muted text-muted-foreground border-border' },
  waiting: { label: 'Waiting for data', icon: HourglassIcon, tone: 'bg-attention-subtle text-attention-foreground border-attention-border' },
  queued: { label: 'Not calculated yet', icon: ClockIcon, tone: 'bg-card text-muted-foreground border-border-strong border-dashed' },
  failed: { label: 'Failed', icon: TriangleAlertIcon, tone: 'bg-danger-subtle text-danger-foreground border-danger-border' },
};

/** A count of days of one kind, in words: "3 holidays", "1 star", "2 waiting for data". */
export function awardKindCount(kind: AwardDayKind, n: number): string {
  const s = n === 1 ? '' : 's';
  switch (kind) {
    case 'awarded': return `${n} star${s}`;
    case 'holiday': return `${n} holiday${s}`;
    case 'no_winner': return `${n} without a winner`;
    case 'waiting': return `${n} waiting for data`;
    case 'queued': return `${n} not calculated yet`;
    case 'failed': return `${n} failed`;
  }
}

/** The order kinds are counted and explained in. */
export const AWARD_KIND_ORDER: readonly AwardDayKind[] = ['awarded', 'no_winner', 'waiting', 'queued', 'failed', 'holiday'];

const CHIP: Record<Exclude<ReasonChipKey, 'other'>, { label: string; icon: Icon }> = {
  attendance: { label: 'Attendance', icon: CalendarXIcon },
  sales: { label: 'Sales', icon: ReceiptIcon },
  comparison: { label: 'Team comparison', icon: UsersIcon },
  eligibility: { label: 'Nobody eligible', icon: UserXIcon },
  tie: { label: 'Exact tie', icon: EqualIcon },
  history: { label: 'Older records', icon: HistoryIcon },
  rules: { label: 'Rules not set', icon: ScaleIcon },
  changed: { label: 'Records changed', icon: RefreshCwIcon },
  inputs: { label: 'Required data', icon: DatabaseIcon },
};

export function AwardKindBadge({ kind, className }: { kind: AwardDayKind; className?: string }) {
  const meta = AWARD_KIND[kind];
  const Icon = meta.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold', meta.tone, className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export function ReasonChipView({ chip }: { chip: ReasonChip }) {
  const meta = chip.key === 'other' ? { label: codeLabel(chip.code), icon: InfoIcon } : CHIP[chip.key];
  const Icon = meta.icon;
  return (
    <span
      title={codeLabel(chip.code)}
      className="border-border bg-card text-muted-foreground inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      {meta.label}
    </span>
  );
}
