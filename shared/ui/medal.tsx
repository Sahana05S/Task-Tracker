import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/shared/utils';

export type MedalTier = 'gold' | 'silver' | 'bronze' | 'diamond';
export type MedalSize = 'sm' | 'md' | 'lg';

const PX: Record<MedalSize, number> = { sm: 24, md: 40, lg: 64 };

/**
 * A medal (27 October 2026, ported from the Catalyst tracker): a tier-coloured
 * rim with a highlight, a dotted inner ring, a tinted face carrying an icon,
 * and an optional number pill for a rank or level. Everything is mixed from
 * the tier tokens, so it reads in both themes. Decorative: the caller's text
 * states the fact, and `label` is only for the rare medal that stands alone.
 */
export function Medal({ tier, icon: Icon, number, size = 'md', label, className }: {
  tier: MedalTier;
  icon: LucideIcon;
  /** Rank or level shown in a pill at the foot. */
  number?: number | string;
  size?: MedalSize;
  /** Accessible name when the medal has no text beside it. */
  label?: string;
  className?: string;
}) {
  const id = React.useId();
  const rim = `${id}-rim`;
  const face = `${id}-face`;
  const tone = `var(--tier-${tier})`;
  const px = PX[size];
  return (
    <svg
      viewBox="0 0 64 64"
      width={px}
      height={px}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('shrink-0 overflow-visible', className)}
    >
      <defs>
        <linearGradient id={rim} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" style={{ stopColor: `color-mix(in oklab, ${tone} 45%, var(--card))` }} />
          <stop offset="0.45" style={{ stopColor: tone }} />
          <stop offset="1" style={{ stopColor: `color-mix(in oklab, ${tone} 62%, var(--metal-ink))` }} />
        </linearGradient>
        <linearGradient id={face} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" style={{ stopColor: `color-mix(in oklab, ${tone} 10%, var(--card))` }} />
          <stop offset="1" style={{ stopColor: `color-mix(in oklab, ${tone} 30%, var(--card))` }} />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="29" fill={`url(#${rim})`} />
      <circle cx="32" cy="32" r="23.5" style={{ fill: `color-mix(in oklab, ${tone} 45%, var(--metal-ink))` }} />
      <circle cx="32" cy="32" r="21.5" fill={`url(#${face})`} />
      <circle cx="32" cy="32" r="26.2" fill="none" strokeDasharray="1.2 2.6" strokeWidth="1.4" style={{ stroke: `color-mix(in oklab, ${tone} 30%, var(--card))` }} />
      <path d="M14.5 26 A18 18 0 0 1 38 11.5" fill="none" strokeWidth="2.2" strokeLinecap="round" style={{ stroke: 'var(--card)', opacity: 0.75 }} />
      <Icon
        x={number === undefined ? 20 : 18}
        y={number === undefined ? 20 : 12.5}
        width={number === undefined ? 24 : 28}
        height={number === undefined ? 24 : 28}
        strokeWidth={2.4}
        style={{ color: `color-mix(in oklab, ${tone} 70%, var(--foreground))` }}
        aria-hidden="true"
      />
      {number !== undefined ? (
        <g>
          <rect x="20" y="45" width="24" height="13" rx="6.5" style={{ fill: 'var(--foreground)', stroke: `color-mix(in oklab, ${tone} 55%, var(--card))` }} strokeWidth="1.2" />
          <text x="32" y="54.6" textAnchor="middle" fontSize="10" fontWeight="800" style={{ fill: 'var(--background)', fontVariantNumeric: 'tabular-nums' }}>
            {number}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

/** Medals overlapping in a row, with "+n" for the rest. */
export function MedalStack({ medals, size = 'sm', max = 4, className }: {
  medals: readonly { key: string; tier: MedalTier; icon: LucideIcon; number?: number | string }[];
  size?: MedalSize;
  max?: number;
  className?: string;
}) {
  const shown = medals.slice(0, max);
  const rest = medals.length - shown.length;
  return (
    <span className={cn('inline-flex items-center', className)}>
      {shown.map((medal, index) => (
        <Medal key={medal.key} tier={medal.tier} icon={medal.icon} number={medal.number} size={size} className={cn(index > 0 && '-ml-2')} />
      ))}
      {rest > 0 ? <span className="text-muted-foreground ml-1 text-xs font-medium tabular-nums">+{rest}</span> : null}
    </span>
  );
}
