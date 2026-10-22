import type * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn, getInitials } from '@/shared/utils';

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
 * A person's initials in a tinted circle; the tint is derived from the name. The letters come from a CSS
 * `attr()` so they stay out of the element's text content: screen readers and
 * text assertions read only the name beside it.
 */
export function InitialsAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-initials={getInitials(name)}
      className={cn('initials-avatar', `initials-avatar-${avatarTone(name)}`, className)}
    />
  );
}

/** A stable tint per person, so the same name has the same colour everywhere. */
function avatarTone(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return hash % 3;
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
          <InitialsAvatar key={`${name}-${index}`} name={name} className="ring-2 ring-white" />
        ))}
      </span>
      <span className="text-muted-foreground truncate text-sm">
        {names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`}
      </span>
      <span className="sr-only">{names.join(', ')}</span>
    </span>
  );
}

/**
 * Centred page column used by Missions, Mission details and the slice 4
 * pages. `wide` widens it for data-dense pages (dashboard, timelines).
 */
export function MissionPage({
  wide = false,
  className,
  children,
}: {
  wide?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-page-width={wide ? 'wide' : undefined}
      className={cn(
        'mx-auto grid w-full content-start gap-5 px-4 pt-6 pb-10 lg:gap-6 lg:px-6',
        wide ? 'max-w-[1440px]' : 'max-w-[1200px]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The page title row every workspace page uses: optional breadcrumb, an
 * optional meta row (badges), the title with a count chip, a muted
 * description, page actions on the right (on their own row on phones) and
 * optional tabs underneath.
 */
export function MissionPageHeader({
  title,
  chip,
  description,
  eyebrow,
  actions,
  breadcrumb,
  meta,
  tabs,
}: {
  title: string;
  chip?: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: string;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  meta?: React.ReactNode;
  tabs?: React.ReactNode;
}) {
  return (
    <header className="grid gap-4">
      {breadcrumb}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          {meta ? <div className="mb-2 flex flex-wrap items-center gap-1.5">{meta}</div> : null}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-foreground text-[1.625rem] leading-tight font-bold tracking-tight text-balance break-words lg:text-[2rem]">
              {title}
            </h1>
            {chip ? <PageChip>{chip}</PageChip> : null}
          </div>
          {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
        </div>
        {/* Own row on phones, so actions never squeeze the title into a narrow column. */}
        {actions ? <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">{actions}</div> : null}
      </div>
      {tabs}
    </header>
  );
}

/** Violet count chip with a dot, as beside the Missions title. */
export function PageChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-primary-subtle text-primary-subtle-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold">
      <span aria-hidden="true" className="bg-primary size-1.5 rounded-full" />
      {children}
    </span>
  );
}

/**
 * Fact tile from Mission details. Renders a `dt`/`dd` pair, so place it in a
 * `<dl>`. The icon is decorative and hidden on phones.
 */
export function StatTile({
  icon: Icon,
  label,
  value,
  unit,
  note,
  tone = 'default',
  className,
}: {
  icon?: LucideIcon;
  label: string;
  value: React.ReactNode;
  unit?: string;
  note?: React.ReactNode;
  tone?: 'default' | 'alert' | 'success';
  className?: string;
}) {
  return (
    <div className={cn('bg-muted/70 flex min-w-0 items-start gap-2.5 rounded-xl px-3 py-3 sm:gap-3 sm:px-3.5', className)}>
      {Icon ? (
        <span aria-hidden="true" className="text-primary hidden size-8 shrink-0 items-center justify-center rounded-lg bg-white sm:flex">
          <Icon className="size-4" />
        </span>
      ) : null}
      <div className="min-w-0">
        <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
        <dd
          className={cn(
            'text-foreground mt-0.5 text-sm font-semibold break-words tabular-nums',
            tone === 'alert' && 'text-danger',
            tone === 'success' && 'text-success-strong',
          )}
        >
          {value}
          {unit ? <span className="text-muted-foreground ml-1 text-xs font-medium">{unit}</span> : null}
        </dd>
        {note ? <dd className="text-muted-foreground mt-0.5 text-xs">{note}</dd> : null}
      </div>
    </div>
  );
}

const NOTICE_TONES = {
  info: 'border-primary/15 bg-primary-subtle/50 text-foreground',
  attention: 'border-attention-border bg-attention-subtle text-attention-foreground',
  danger: 'border-danger-border bg-danger-subtle text-danger-foreground',
} as const;

/**
 * Callout. `info` is the lavender note for rules text; `attention` is the
 * amber surface for missing data; `danger` is for failures and refusals.
 */
export function MissionNotice({
  tone = 'info',
  icon: Icon,
  className,
  children,
  ...props
}: {
  tone?: 'info' | 'attention' | 'danger';
  icon?: LucideIcon;
} & React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm',
        NOTICE_TONES[tone],
        className,
      )}
      {...props}
    >
      {Icon ? (
        <Icon
          className={cn('mt-0.5 size-4 shrink-0', tone === 'info' ? 'text-primary' : '')}
          aria-hidden="true"
        />
      ) : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * Empty state: what this place is, optionally a title and one next action.
 * `chart` keeps an empty chart area at the chart's height.
 */
export function EmptyState({
  title,
  children,
  icon: Icon,
  action,
  variant = 'inline',
  className,
}: {
  title?: string;
  children?: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  variant?: 'inline' | 'chart';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'bg-muted/70 text-muted-foreground grid justify-items-center gap-1.5 rounded-xl px-6 py-6 text-center text-sm',
        variant === 'chart' && 'h-64 content-center',
        className,
      )}
    >
      {Icon ? <Icon className="size-5" aria-hidden="true" /> : null}
      {title ? <p className="text-foreground font-semibold">{title}</p> : null}
      {children ? <p className="max-w-md text-pretty">{children}</p> : null}
      {action}
    </div>
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
