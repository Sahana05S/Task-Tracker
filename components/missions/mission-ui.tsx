import type * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn, getInitials } from '@/lib/utils';

/**
 * Shared building blocks for the Missions list and Mission details pages
 * (Stitch references missions_list_1 and mission_details_1/2). Server-safe: no
 * hooks, so both server pages and client cards can use them.
 */

/** Mint progress bar from DESIGN.md. `null` renders an empty track. */
export function MissionProgress({
  value,
  label,
  className,
}: {
  value: number | null;
  label: string;
  className?: string;
}) {
  const clamped = value === null ? null : Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn('progress-track', className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped ?? undefined}
    >
      <div className="progress-fill" style={{ width: `${clamped ?? 0}%` }} />
    </div>
  );
}

/**
 * A person's initials in a tinted circle. The letters come from a CSS
 * `attr()` so they stay out of the element's text content: screen readers and
 * text assertions read only the name beside it.
 */
export function InitialsAvatar({
  name,
  tone = 0,
  className,
}: {
  name: string;
  tone?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-initials={getInitials(name)}
      className={cn('initials-avatar', `initials-avatar-${tone % 3}`, className)}
    />
  );
}

/** Overlapping avatars for a card footer, with the names as accessible text. */
export function AvatarStack({
  names,
  max = 3,
}: {
  names: readonly string[];
  max?: number;
}) {
  if (names.length === 0) {
    return <span className="text-muted-foreground text-sm">Unassigned</span>;
  }
  const shown = names.slice(0, max);
  return (
    <span className="flex min-w-0 items-center gap-2" title={names.join(', ')}>
      <span className="flex shrink-0 -space-x-2">
        {shown.map((name, index) => (
          <InitialsAvatar key={`${name}-${index}`} name={name} tone={index} className="ring-2 ring-white" />
        ))}
      </span>
      <span className="text-muted-foreground truncate text-sm">
        {names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`}
      </span>
      <span className="sr-only">{names.join(', ')}</span>
    </span>
  );
}

/** White bento card with an icon title row, as used on Mission details. */
export function MissionPanel({
  icon: Icon,
  title,
  subtitle,
  action,
  className,
  children,
  ...props
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
} & React.ComponentProps<'section'>) {
  return (
    <section className={cn('soft-card p-5 sm:p-6', className)} {...props}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight">
            {Icon ? <Icon className="text-primary size-5 shrink-0" aria-hidden="true" /> : null}
            {title}
          </h2>
          {subtitle ? <p className="text-muted-foreground mt-0.5 text-xs">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
