'use client';

import type { LucideIcon } from 'lucide-react';

import { cn } from '@/shared/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  /** Show only the icon; the label stays the accessible name. */
  iconOnly?: boolean;
}

/**
 * A small set of mutually exclusive views (cards or table, roadmap or list):
 * a muted tray with the chosen option raised.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onValueChange,
  className,
}: {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onValueChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn('bg-muted inline-flex shrink-0 items-center gap-0.5 rounded-xl p-1', className)}>
      {options.map(({ value: option, label: optionLabel, icon: Icon, iconOnly }) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          aria-label={iconOnly ? optionLabel : undefined}
          title={iconOnly ? optionLabel : undefined}
          onClick={() => onValueChange(option)}
          className={cn(
            'text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex h-8 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors outline-none focus-visible:ring-2',
            iconOnly ? 'w-8' : 'px-3',
            'aria-pressed:bg-card aria-pressed:text-primary aria-pressed:shadow-(--shadow-card)',
          )}
        >
          {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
          {iconOnly ? null : optionLabel}
        </button>
      ))}
    </div>
  );
}
