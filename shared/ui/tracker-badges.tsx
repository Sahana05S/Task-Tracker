import * as React from 'react';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  CircleDashedIcon,
  CrownIcon,
  DatabaseIcon,
  FlameIcon,
  MinusIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  ShieldCheckIcon,
  SquareIcon,
  UserRoundIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react';

import { CATEGORY_LABELS, ROLE_LABELS } from '@/shared/tracker/enums';
import { cn } from '@/shared/utils';
import type {
  TaskCategory,
  TaskFreshness,
  TaskPriority,
  TaskStatus,
  UserRole,
} from '@/types/tracker';

/**
 * Soft-tint badges for the tracker taxonomies.
 *
 * The tint values themselves live once, as utility classes in
 * `app/globals.css`, transcribed from `reference/steering/responsive-ui-design.md`. These
 * components only select the right class for a given enum value.
 *
 * Each lookup is `satisfies Record<Enum, string>`, so adding a member to any
 * union in `@/types/tracker` turns the missing badge into a compile error
 * rather than an unstyled badge at runtime.
 *
 * Since 27 October 2026 (ported from the Catalyst tracker) status, priority
 * and role chips lead with a small glyph, so a chip reads at a glance in a
 * dense row and without its colour. The glyph is decorative; the text stays.
 */

/* -------------------------------------------------------------------------- */
/* Class lookups                                                              */
/* -------------------------------------------------------------------------- */

const STATUS_CLASSES = {
  Done: 'badge-status-done',
  'In Progress': 'badge-status-in-progress',
  'Not Started': 'badge-status-not-started',
  Stopped: 'badge-status-not-started',
  'On-Hold': 'badge-status-not-started',
  Carryover: 'badge-status-in-progress',
  Discarded: 'badge-status-discarded',
} satisfies Record<TaskStatus, string>;

const STATUS_GLYPHS = {
  Done: CheckIcon,
  'In Progress': PlayIcon,
  'Not Started': CircleDashedIcon,
  Stopped: SquareIcon,
  'On-Hold': PauseIcon,
  Carryover: RotateCcwIcon,
  Discarded: XIcon,
} satisfies Record<TaskStatus, LucideIcon>;

const PRIORITY_CLASSES = {
  Focus: 'badge-priority-focus',
  High: 'badge-priority-high',
  Medium: 'badge-priority-medium',
  Low: 'badge-priority-low',
  No: 'badge-priority-no',
} satisfies Record<TaskPriority, string>;

/** Unprioritised chips carry no glyph: they are meant to recede. */
const PRIORITY_GLYPHS = {
  Focus: FlameIcon,
  High: ArrowUpIcon,
  Medium: MinusIcon,
  Low: ArrowDownIcon,
  No: null,
} satisfies Record<TaskPriority, LucideIcon | null>;

const ROLE_GLYPHS = {
  managing_director: CrownIcon,
  project_engineer: ShieldCheckIcon,
  data_manager: DatabaseIcon,
  team_member: UserRoundIcon,
} satisfies Record<UserRole, LucideIcon>;

const FRESHNESS_CLASSES = {
  Fresh: 'freshness-fresh',
  Stale: 'freshness-stale',
  Rotten: 'freshness-rotten',
  'Super Fresh': 'freshness-fresh',
  'Almost Fresh': 'freshness-fresh',
  'Almost Stale': 'freshness-stale',
} satisfies Record<TaskFreshness, string>;

/* -------------------------------------------------------------------------- */
/* Components                                                                 */
/* -------------------------------------------------------------------------- */

export interface StatusBadgeProps extends React.ComponentProps<'span'> {
  status: TaskStatus;
}

export function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
  const Glyph = STATUS_GLYPHS[status];
  return (
    <span
      className={cn('badge-soft', STATUS_CLASSES[status], className)}
      {...props}
    >
      <Glyph className="size-3 shrink-0" strokeWidth={2.75} aria-hidden="true" />
      {status}
    </span>
  );
}

export interface PriorityBadgeProps extends React.ComponentProps<'span'> {
  priority: TaskPriority;
}

export function PriorityBadge({
  priority,
  className,
  ...props
}: PriorityBadgeProps) {
  const Glyph = PRIORITY_GLYPHS[priority];
  return (
    <span
      className={cn('badge-soft', PRIORITY_CLASSES[priority], className)}
      {...props}
    >
      {Glyph ? <Glyph className="size-3 shrink-0" strokeWidth={2.75} aria-hidden="true" /> : null}
      {priority}
    </span>
  );
}

export interface FreshnessIndicatorProps extends React.ComponentProps<'span'> {
  freshness: TaskFreshness | null;
}

export function FreshnessIndicator({
  freshness,
  className,
  ...props
}: FreshnessIndicatorProps) {
  return (
    <span
      className={cn(
        'freshness-indicator',
        freshness === null ? "text-muted-foreground" : FRESHNESS_CLASSES[freshness],
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="freshness-dot" />
      {freshness ?? "—"}
    </span>
  );
}

export interface CategoryBadgeProps extends React.ComponentProps<'span'> {
  category: TaskCategory;
}

/**
 * Category chip. Shows the short code, which is what the sheet uses and what
 * fits a dense grid, with the long name as the accessible label and tooltip.
 */
export function CategoryBadge({
  category,
  className,
  ...props
}: CategoryBadgeProps) {
  return (
    <span
      className={cn('badge-soft badge-category', className)}
      title={CATEGORY_LABELS[category]}
      {...props}
    >
      <span aria-hidden="true">{category}</span>
      <span className="sr-only">{CATEGORY_LABELS[category]}</span>
    </span>
  );
}

export interface RoleBadgeProps extends React.ComponentProps<'span'> {
  role: UserRole;
}

/**
 * Role indicator for the sidebar profile block. Deliberately neutral: the
 * design spec assigns tints to status, priority and freshness only, so giving
 * roles their own colours would invent meaning the sheet does not have (kept
 * by user decision, 27 October 2026). A glyph per role tells them apart.
 */
export function RoleBadge({ role, className, ...props }: RoleBadgeProps) {
  const Glyph = ROLE_GLYPHS[role];
  return (
    <span
      className={cn('badge-soft badge-neutral', className)}
      {...props}
    >
      <Glyph className="size-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
      {ROLE_LABELS[role]}
    </span>
  );
}
