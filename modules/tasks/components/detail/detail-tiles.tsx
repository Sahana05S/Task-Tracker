import type * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { InitialsAvatar } from '@/components/missions/mission-ui';
import { cn } from '@/shared/utils';

/** Small presentational building blocks of the mission details page. */

export function FactTile({
  icon: Icon,
  label,
  value,
  note,
  alert = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note?: string;
  alert?: boolean;
}) {
  return (
    <div className="bg-muted/70 flex min-w-0 items-start gap-2.5 rounded-xl px-3 py-3 sm:gap-3 sm:px-3.5">
      <span aria-hidden="true" className="text-primary hidden size-8 shrink-0 items-center justify-center rounded-lg bg-white sm:flex">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
        <dd className={cn('text-foreground mt-0.5 text-sm font-semibold break-words', alert && 'text-rose-700')}>
          {value}
          {note ? <span className="ml-1.5 text-xs font-semibold text-rose-700">· {note}</span> : null}
        </dd>
      </div>
    </div>
  );
}

/** People with initials avatars; the avatar letters are not part of the text. */
export function PeopleTile({
  label,
  names,
  fallback,
}: {
  label: string;
  names: readonly string[];
  fallback: string;
}) {
  return (
    <div className="bg-muted/70 col-span-2 rounded-xl px-3.5 py-3 xl:col-span-3">
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd className="mt-2 flex flex-wrap gap-2">
        {names.length === 0 ? (
          <span className="text-muted-foreground text-sm">{fallback}</span>
        ) : (
          names.map((name, index) => (
            <span key={`${name}-${index}`} className="flex items-center gap-2 rounded-full bg-white py-1 pr-3 pl-1 text-sm font-medium shadow-(--shadow-card)">
              <InitialsAvatar name={name} tone={index} className="size-7 text-[10px]" />
              {name}
            </span>
          ))
        )}
      </dd>
    </div>
  );
}

export function TextBlock({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="eyebrow text-muted-foreground">{title}</p>
      <p className="text-foreground mt-1 text-sm whitespace-pre-wrap">{body}</p>
    </div>
  );
}

export function SmartGoalTile({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="border-border rounded-xl border bg-white px-3.5 py-3">
      <p className="text-primary text-[11px] font-bold tracking-[0.06em] uppercase">{label}</p>
      <p className={cn('mt-1 text-sm whitespace-pre-wrap', value ? 'text-foreground' : 'text-muted-foreground')}>
        {value ?? '—'}
      </p>
    </div>
  );
}

export function Disclosure({
  summary,
  icon: Icon,
  children,
}: {
  summary: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <details className="border-border group rounded-xl border">
      <summary className="text-primary flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold select-none">
        {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
        {summary}
      </summary>
      <div className="border-border border-t p-4">{children}</div>
    </details>
  );
}

export function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
