import * as React from 'react';

import { CATEGORY_LABELS, ROLE_LABELS } from '@/lib/tracker/enums';
import { cn } from '@/lib/utils';
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
 * `app/globals.css`, transcribed from `steering/responsive-ui-design.md`. These
 * components only select the right class for a given enum value.
 *
 * Each lookup is `satisfies Record<Enum, string>`, so adding a member to any
 * union in `@/types/tracker` turns the missing badge into a compile error
 * rather than an unstyled badge at runtime.
 */

/* -------------------------------------------------------------------------- */
/* Class lookups                                                              */
/* -------------------------------------------------------------------------- */

const STATUS_CLASSES = {
  Done: 'badge-status-done',
  'In Progress': 'badge-status-in-progress',
  'Not Started': 'badge-status-not-started',
  Discarded: 'badge-status-discarded',
} satisfies Record<TaskStatus, string>;

const PRIORITY_CLASSES = {
  Focus: 'badge-priority-focus',
  High: 'badge-priority-high',
  Medium: 'badge-priority-medium',
  Low: 'badge-priority-low',
  No: 'badge-priority-no',
} satisfies Record<TaskPriority, string>;

const FRESHNESS_CLASSES = {
  Fresh: 'freshness-fresh',
  Stale: 'freshness-stale',
  Rotten: 'freshness-rotten',
} satisfies Record<TaskFreshness, string>;

/* -------------------------------------------------------------------------- */
/* Components                                                                 */
/* -------------------------------------------------------------------------- */

export interface StatusBadgeProps extends React.ComponentProps<'span'> {
  status: TaskStatus;
}

export function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
  return (
    <span
      className={cn('badge-soft', STATUS_CLASSES[status], className)}
      {...props}
    >
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
  return (
    <span
      className={cn('badge-soft', PRIORITY_CLASSES[priority], className)}
      {...props}
    >
      {priority}
    </span>
  );
}

export interface FreshnessIndicatorProps extends React.ComponentProps<'span'> {
  freshness: TaskFreshness;
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
        FRESHNESS_CLASSES[freshness],
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="freshness-dot" />
      {freshness}
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
 * roles their own colours would invent meaning the sheet does not have.
 */
export function RoleBadge({ role, className, ...props }: RoleBadgeProps) {
  return (
    <span
      className={cn('badge-soft badge-neutral', className)}
      {...props}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}
